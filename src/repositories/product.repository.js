import prisma from '../lib/prisma.js';
import { normalizeDbError } from '../lib/db-error.js';

const ALLOWED_ADMIN_STOCK_ADJUSTMENT_INTENT_CLASSES = new Set([
  'RECOUNT_CORRECTION',
  'DAMAGE_LOSS_CORRECTION',
  'AUTHORIZED_RESTORATION',
]);

const ADMIN_STOCK_ADJUSTMENT_ATTEMPT_CLASS = Object.freeze({
  NEW_INTENDED_ADJUSTMENT: 'NEW_INTENDED_ADJUSTMENT',
  REPLAYED_PRIOR_OUTCOME: 'REPLAYED_PRIOR_OUTCOME',
  DUPLICATE_REQUEST: 'DUPLICATE_REQUEST',
});

function buildAuthoritativeSamenessFingerprint({
  resolvedProductId,
  intentClass,
  quantityDelta,
  expectedStock,
  evidenceRef,
}) {
  return {
    resolvedProductId,
    intentClass,
    quantityDelta,
    expectedStock,
    evidenceRef: evidenceRef || null,
  };
}

function hasAuthoritativeSameness(priorAudit, currentFingerprint) {
  if (!priorAudit || !currentFingerprint) {
    return false;
  }

  return priorAudit.targetProductId === currentFingerprint.resolvedProductId
    && priorAudit.intentClass === currentFingerprint.intentClass
    && priorAudit.requestedQuantityDelta === currentFingerprint.quantityDelta
    && priorAudit.requestedExpectedStock === currentFingerprint.expectedStock
    && (priorAudit.evidenceRef || null) === currentFingerprint.evidenceRef;
}

function mapAdminProductCoreData(payload) {
  return {
    ...(payload.name !== undefined ? { name: payload.name } : {}),
    ...(payload.slug !== undefined ? { slug: payload.slug } : {}),
    ...(payload.shortDescription !== undefined ? { shortDescription: payload.shortDescription } : {}),
    ...(payload.description !== undefined ? { description: payload.description } : {}),
    ...(payload.price !== undefined ? { price: payload.price } : {}),
    ...(payload.currency !== undefined ? { currency: payload.currency } : {}),
    ...(payload.stock !== undefined ? { stock: payload.stock } : {}),
    ...(payload.status !== undefined ? { status: payload.status } : {}),
  };
}

function mapAdminMediaCreate(media = []) {
  return [...media]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((item) => ({
      id: item.id,
      url: item.url,
      alt: item.alt,
      isPrimary: item.isPrimary,
      kind: item.kind,
      position: item.sortOrder,
    }));
}

export const productRepository = {
  async create(data) {
    try { return await prisma.product.create({ data }); } catch (error) { normalizeDbError(error, { repository: 'product', operation: 'create' }); }
  },
  async findById(id) {
    try { return await prisma.product.findUnique({ where: { id } }); } catch (error) { normalizeDbError(error, { repository: 'product', operation: 'findById' }); }
  },
  async update(id, data) {
    try { return await prisma.product.update({ where: { id }, data }); } catch (error) { normalizeDbError(error, { repository: 'product', operation: 'update' }); }
  },
  async delete(id) {
    try { return await prisma.product.delete({ where: { id } }); } catch (error) { normalizeDbError(error, { repository: 'product', operation: 'delete' }); }
  },
  async list(params = {}) {
    const { skip = 0, take = 50, where = {}, orderBy = { createdAt: 'desc' } } = params;
    try { return await prisma.product.findMany({ skip, take, where, orderBy }); } catch (error) { normalizeDbError(error, { repository: 'product', operation: 'list' }); }
  },
  async createAdminProduct(payload) {
    const data = mapAdminProductCoreData(payload);
    if (payload.media !== undefined) {
      data.images = { create: mapAdminMediaCreate(payload.media) };
    }

    try {
      return await prisma.product.create({
        data,
        include: {
          images: {
            orderBy: { position: 'asc' },
          },
        },
      });
    } catch (error) { normalizeDbError(error, { repository: 'product', operation: 'createAdminProduct' }); }
  },
  async listAdminProducts() {
    try {
      return await prisma.product.findMany({
        orderBy: [
          { createdAt: 'desc' },
          { id: 'asc' },
        ],
        include: {
          images: {
            orderBy: { position: 'asc' },
          },
        },
      });
    } catch (error) { normalizeDbError(error, { repository: 'product', operation: 'listAdminProducts' }); }
  },
  async findAdminProductById(id) {
    try {
      return await prisma.product.findUniqueOrThrow({
        where: { id },
        include: {
          images: {
            orderBy: { position: 'asc' },
          },
        },
      });
    } catch (error) { normalizeDbError(error, { repository: 'product', operation: 'findAdminProductById' }); }
  },
  async updateAdminProductById(id, payload) {
    try {
      return await prisma.product.update({
        where: { id },
        data: mapAdminProductCoreData(payload),
        include: {
          images: {
            orderBy: { position: 'asc' },
          },
        },
      });
    } catch (error) { normalizeDbError(error, { repository: 'product', operation: 'updateAdminProductById' }); }
  },
  async publishProductById(id) {
    try { return await prisma.product.update({ where: { id }, data: { status: 'published' } }); } catch (error) { normalizeDbError(error, { repository: 'product', operation: 'publishProductById' }); }
  },
  async unpublishProductById(id) {
    try { return await prisma.product.update({ where: { id }, data: { status: 'draft' } }); } catch (error) { normalizeDbError(error, { repository: 'product', operation: 'unpublishProductById' }); }
  },
  async replaceProductMediaById(id, media) {
    try {
      return await prisma.product.update({
        where: { id },
        data: {
          images: {
            deleteMany: {},
            create: mapAdminMediaCreate(media),
          },
        },
        include: {
          images: {
            orderBy: { position: 'asc' },
          },
        },
      });
    } catch (error) { normalizeDbError(error, { repository: 'product', operation: 'replaceProductMediaById' }); }
  },
  async applyAdminStockAdjustment({
    actorUserId,
    intentClass,
    target,
    quantityDelta,
    expectedStock,
    requestKey,
    evidenceRef = null,
    note = null,
  }) {
    const operation = 'applyAdminStockAdjustment';
    try {
      return await prisma.$transaction(async (tx) => {
        const baseAuditData = {
          actorUserId,
          requestKey,
          intentClass,
          targetResolverSku: target.sku || null,
          requestedQuantityDelta: quantityDelta,
          requestedExpectedStock: expectedStock,
          evidenceRef: evidenceRef || null,
          note: note || null,
        };

        const existingAttempt = await tx.adminStockAdjustmentAudit.findFirst({
          where: {
            actorUserId,
            requestKey,
          },
          orderBy: { createdAt: 'asc' },
        });

        if (!ALLOWED_ADMIN_STOCK_ADJUSTMENT_INTENT_CLASSES.has(intentClass)) {
          const audit = await tx.adminStockAdjustmentAudit.create({
            data: {
              ...baseAuditData,
              attemptClass: ADMIN_STOCK_ADJUSTMENT_ATTEMPT_CLASS.NEW_INTENDED_ADJUSTMENT,
              outcomeClass: 'REJECTED',
              rejectionClass: 'INVALID_INTENT',
            },
          });
          return {
            applied: false,
            attemptClass: ADMIN_STOCK_ADJUSTMENT_ATTEMPT_CLASS.NEW_INTENDED_ADJUSTMENT,
            outcomeClass: 'REJECTED',
            rejectionClass: 'INVALID_INTENT',
            auditId: audit.id,
          };
        }

        let resolvedProductId = target.productId || null;
        if (!resolvedProductId && target.sku) {
          const variant = await tx.productVariant.findUnique({
            where: { sku: target.sku },
            select: { productId: true },
          });
          resolvedProductId = variant?.productId || null;
        }

        if (!resolvedProductId) {
          const unresolvedTargetAttemptClass = existingAttempt
            ? ADMIN_STOCK_ADJUSTMENT_ATTEMPT_CLASS.DUPLICATE_REQUEST
            : ADMIN_STOCK_ADJUSTMENT_ATTEMPT_CLASS.NEW_INTENDED_ADJUSTMENT;
          const audit = await tx.adminStockAdjustmentAudit.create({
            data: {
              ...baseAuditData,
              attemptClass: unresolvedTargetAttemptClass,
              outcomeClass: 'REJECTED',
              rejectionClass: 'INVALID_TARGET',
            },
          });
          return {
            applied: false,
            attemptClass: unresolvedTargetAttemptClass,
            outcomeClass: 'REJECTED',
            rejectionClass: 'INVALID_TARGET',
            auditId: audit.id,
          };
        }

        const currentFingerprint = buildAuthoritativeSamenessFingerprint({
          resolvedProductId,
          intentClass,
          quantityDelta,
          expectedStock,
          evidenceRef,
        });

        if (existingAttempt) {
          if (hasAuthoritativeSameness(existingAttempt, currentFingerprint)) {
            const replayAudit = await tx.adminStockAdjustmentAudit.create({
              data: {
                ...baseAuditData,
                attemptClass: ADMIN_STOCK_ADJUSTMENT_ATTEMPT_CLASS.REPLAYED_PRIOR_OUTCOME,
                replayOfAuditId: existingAttempt.id,
                targetProductId: existingAttempt.targetProductId,
                beforeQuantity: existingAttempt.beforeQuantity,
                afterQuantity: existingAttempt.afterQuantity,
                outcomeClass: existingAttempt.outcomeClass,
                rejectionClass: existingAttempt.rejectionClass,
              },
            });

            return {
              applied: false,
              attemptClass: ADMIN_STOCK_ADJUSTMENT_ATTEMPT_CLASS.REPLAYED_PRIOR_OUTCOME,
              outcomeClass: existingAttempt.outcomeClass,
              rejectionClass: existingAttempt.rejectionClass,
              targetProductId: existingAttempt.targetProductId,
              beforeQuantity: existingAttempt.beforeQuantity,
              afterQuantity: existingAttempt.afterQuantity,
              replayOfAuditId: existingAttempt.id,
              auditId: replayAudit.id,
            };
          }

          const duplicateAudit = await tx.adminStockAdjustmentAudit.create({
            data: {
              ...baseAuditData,
              attemptClass: ADMIN_STOCK_ADJUSTMENT_ATTEMPT_CLASS.DUPLICATE_REQUEST,
              replayOfAuditId: existingAttempt.id,
              targetProductId: resolvedProductId,
              outcomeClass: 'REJECTED',
              rejectionClass: 'INVALID_PRECONDITION',
            },
          });

          return {
            applied: false,
            attemptClass: ADMIN_STOCK_ADJUSTMENT_ATTEMPT_CLASS.DUPLICATE_REQUEST,
            outcomeClass: 'REJECTED',
            rejectionClass: 'INVALID_PRECONDITION',
            targetProductId: resolvedProductId,
            replayOfAuditId: existingAttempt.id,
            auditId: duplicateAudit.id,
          };
        }

        const product = await tx.product.findUnique({
          where: { id: resolvedProductId },
          select: { id: true, stock: true },
        });

        if (!product) {
          const audit = await tx.adminStockAdjustmentAudit.create({
            data: {
              ...baseAuditData,
              targetProductId: resolvedProductId,
              attemptClass: ADMIN_STOCK_ADJUSTMENT_ATTEMPT_CLASS.NEW_INTENDED_ADJUSTMENT,
              outcomeClass: 'REJECTED',
              rejectionClass: 'INVALID_TARGET',
            },
          });
          return {
            applied: false,
            attemptClass: ADMIN_STOCK_ADJUSTMENT_ATTEMPT_CLASS.NEW_INTENDED_ADJUSTMENT,
            outcomeClass: 'REJECTED',
            rejectionClass: 'INVALID_TARGET',
            auditId: audit.id,
          };
        }

        if (product.stock !== expectedStock) {
          const audit = await tx.adminStockAdjustmentAudit.create({
            data: {
              ...baseAuditData,
              targetProductId: product.id,
              beforeQuantity: product.stock,
              attemptClass: ADMIN_STOCK_ADJUSTMENT_ATTEMPT_CLASS.NEW_INTENDED_ADJUSTMENT,
              outcomeClass: 'REJECTED',
              rejectionClass: 'INVALID_PRECONDITION',
            },
          });
          return {
            applied: false,
            attemptClass: ADMIN_STOCK_ADJUSTMENT_ATTEMPT_CLASS.NEW_INTENDED_ADJUSTMENT,
            outcomeClass: 'REJECTED',
            rejectionClass: 'INVALID_PRECONDITION',
            targetProductId: product.id,
            beforeQuantity: product.stock,
            auditId: audit.id,
          };
        }

        const afterQuantity = product.stock + quantityDelta;
        if (afterQuantity < 0) {
          const audit = await tx.adminStockAdjustmentAudit.create({
            data: {
              ...baseAuditData,
              targetProductId: product.id,
              beforeQuantity: product.stock,
              attemptClass: ADMIN_STOCK_ADJUSTMENT_ATTEMPT_CLASS.NEW_INTENDED_ADJUSTMENT,
              outcomeClass: 'REJECTED',
              rejectionClass: 'INVALID_PRECONDITION',
            },
          });
          return {
            applied: false,
            attemptClass: ADMIN_STOCK_ADJUSTMENT_ATTEMPT_CLASS.NEW_INTENDED_ADJUSTMENT,
            outcomeClass: 'REJECTED',
            rejectionClass: 'INVALID_PRECONDITION',
            targetProductId: product.id,
            beforeQuantity: product.stock,
            auditId: audit.id,
          };
        }

        const updateResult = await tx.product.updateMany({
          where: {
            id: product.id,
            stock: expectedStock,
          },
          data: {
            stock: afterQuantity,
          },
        });

        if (updateResult.count !== 1) {
          const audit = await tx.adminStockAdjustmentAudit.create({
            data: {
              ...baseAuditData,
              targetProductId: product.id,
              beforeQuantity: product.stock,
              attemptClass: ADMIN_STOCK_ADJUSTMENT_ATTEMPT_CLASS.NEW_INTENDED_ADJUSTMENT,
              outcomeClass: 'REJECTED',
              rejectionClass: 'CONFLICT_CONCURRENT_CONTRADICTION',
            },
          });
          return {
            applied: false,
            attemptClass: ADMIN_STOCK_ADJUSTMENT_ATTEMPT_CLASS.NEW_INTENDED_ADJUSTMENT,
            outcomeClass: 'REJECTED',
            rejectionClass: 'CONFLICT_CONCURRENT_CONTRADICTION',
            targetProductId: product.id,
            beforeQuantity: product.stock,
            auditId: audit.id,
          };
        }

        const audit = await tx.adminStockAdjustmentAudit.create({
          data: {
            ...baseAuditData,
            targetProductId: product.id,
            beforeQuantity: product.stock,
            afterQuantity,
            attemptClass: ADMIN_STOCK_ADJUSTMENT_ATTEMPT_CLASS.NEW_INTENDED_ADJUSTMENT,
            outcomeClass: 'APPLIED',
          },
        });

        return {
          applied: true,
          attemptClass: ADMIN_STOCK_ADJUSTMENT_ATTEMPT_CLASS.NEW_INTENDED_ADJUSTMENT,
          outcomeClass: 'APPLIED',
          rejectionClass: null,
          targetProductId: product.id,
          beforeQuantity: product.stock,
          afterQuantity,
          auditId: audit.id,
        };
      });
    } catch (error) { normalizeDbError(error, { repository: 'product', operation }); }
  },
  async listAdminStockAdjustmentAttempts({
    limit = 50,
    actorUserId,
    targetProductId,
    requestKey,
    attemptClass,
  } = {}) {
    const operation = 'listAdminStockAdjustmentAttempts';
    const where = {
      ...(actorUserId ? { actorUserId } : {}),
      ...(targetProductId ? { targetProductId } : {}),
      ...(requestKey ? { requestKey } : {}),
      ...(attemptClass ? { attemptClass } : {}),
    };

    try {
      return await prisma.adminStockAdjustmentAudit.findMany({
        where,
        take: limit,
        orderBy: [
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        select: {
          id: true,
          actorUserId: true,
          requestKey: true,
          targetProductId: true,
          targetResolverSku: true,
          intentClass: true,
          requestedQuantityDelta: true,
          requestedExpectedStock: true,
          beforeQuantity: true,
          afterQuantity: true,
          attemptClass: true,
          outcomeClass: true,
          rejectionClass: true,
          replayOfAuditId: true,
          evidenceRef: true,
          note: true,
          createdAt: true,
        },
      });
    } catch (error) { normalizeDbError(error, { repository: 'product', operation }); }
  },
};

export default productRepository;
