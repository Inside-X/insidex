import prisma from '../lib/prisma.js';
import { normalizeDbError } from '../lib/db-error.js';

const ALLOWED_ADMIN_STOCK_ADJUSTMENT_INTENT_CLASSES = new Set([
  'RECOUNT_CORRECTION',
  'DAMAGE_LOSS_CORRECTION',
  'AUTHORIZED_RESTORATION',
]);

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
    evidenceRef = null,
    note = null,
  }) {
    const operation = 'applyAdminStockAdjustment';
    try {
      return await prisma.$transaction(async (tx) => {
        const baseAuditData = {
          actorUserId,
          intentClass,
          targetResolverSku: target.sku || null,
          evidenceRef: evidenceRef || null,
          note: note || null,
        };

        if (!ALLOWED_ADMIN_STOCK_ADJUSTMENT_INTENT_CLASSES.has(intentClass)) {
          const audit = await tx.adminStockAdjustmentAudit.create({
            data: {
              ...baseAuditData,
              outcomeClass: 'REJECTED',
              rejectionClass: 'INVALID_INTENT',
            },
          });
          return {
            applied: false,
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
          const audit = await tx.adminStockAdjustmentAudit.create({
            data: {
              ...baseAuditData,
              outcomeClass: 'REJECTED',
              rejectionClass: 'INVALID_TARGET',
            },
          });
          return {
            applied: false,
            outcomeClass: 'REJECTED',
            rejectionClass: 'INVALID_TARGET',
            auditId: audit.id,
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
              outcomeClass: 'REJECTED',
              rejectionClass: 'INVALID_TARGET',
            },
          });
          return {
            applied: false,
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
              outcomeClass: 'REJECTED',
              rejectionClass: 'INVALID_PRECONDITION',
            },
          });
          return {
            applied: false,
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
              outcomeClass: 'REJECTED',
              rejectionClass: 'INVALID_PRECONDITION',
            },
          });
          return {
            applied: false,
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
              outcomeClass: 'REJECTED',
              rejectionClass: 'CONFLICT_CONCURRENT_CONTRADICTION',
            },
          });
          return {
            applied: false,
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
            outcomeClass: 'APPLIED',
          },
        });

        return {
          applied: true,
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
};

export default productRepository;
