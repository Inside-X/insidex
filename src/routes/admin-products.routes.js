import express from 'express';
import { validate } from '../validation/validate.middleware.js';
import { adminProductsSchemas } from '../validation/schemas/admin-products.schema.js';
import { productRepository } from '../repositories/product.repository.js';
import { mediaUploadRepository } from '../repositories/media-upload.repository.js';
import { ValidationError } from '../errors/validation-error.js';
import { requirePermission } from '../middlewares/requirePermission.js';

const router = express.Router();

function resolveMediaUploadRepository(req) {
  return req.app?.locals?.mediaUploadRepository || mediaUploadRepository;
}

function toContractMedia(media = []) {
  return [...media]
    .sort((left, right) => left.position - right.position)
    .map((item) => ({
      id: item.id,
      url: item.url,
      alt: item.alt,
      sortOrder: item.position,
      isPrimary: item.isPrimary,
      kind: item.kind,
    }));
}

function toContractProduct(product, media = []) {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    ...(product.shortDescription !== undefined && product.shortDescription !== null
      ? { shortDescription: product.shortDescription }
      : {}),
    description: product.description,
    price: product.price,
    currency: product.currency,
    stock: product.stock,
    status: product.status,
    media,
  };
}

function toContractStockAdjustmentAttempt(attempt) {
  return {
    auditId: attempt.id,
    actorUserId: attempt.actorUserId,
    requestKey: attempt.requestKey,
    targetProductId: attempt.targetProductId,
    targetResolverSku: attempt.targetResolverSku,
    intentClass: attempt.intentClass,
    requestedQuantityDelta: attempt.requestedQuantityDelta,
    requestedExpectedStock: attempt.requestedExpectedStock,
    beforeQuantity: attempt.beforeQuantity,
    afterQuantity: attempt.afterQuantity,
    attemptClass: attempt.attemptClass,
    outcomeClass: attempt.outcomeClass,
    rejectionClass: attempt.rejectionClass,
    replayOfAuditId: attempt.replayOfAuditId,
    evidenceRef: attempt.evidenceRef,
    note: attempt.note,
    createdAt: attempt.createdAt,
  };
}

router.post(
  '/',
  validate(adminProductsSchemas.create),
  async (req, res, next) => {
    try {
      const created = await productRepository.createAdminProduct(req.body);

      return res.status(201).json({
        data: toContractProduct(created, toContractMedia(created.images ?? [])),
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  '/',
  async (_req, res, next) => {
    try {
      const products = await productRepository.listAdminProducts();

      return res.status(200).json({
        data: products.map((product) => toContractProduct(product, toContractMedia(product.images ?? []))),
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  '/stock-adjustments',
  requirePermission('admin:stock:adjustments:read'),
  validate(adminProductsSchemas.listStockAdjustments, 'query'),
  async (req, res, next) => {
    try {
      const attempts = await productRepository.listAdminStockAdjustmentAttempts({
        limit: req.query.limit,
        actorUserId: req.query.actorUserId,
        targetProductId: req.query.targetProductId,
        requestKey: req.query.requestKey,
        attemptClass: req.query.attemptClass,
      });

      return res.status(200).json({
        data: attempts.map((attempt) => toContractStockAdjustmentAttempt(attempt)),
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  '/:id',
  validate(adminProductsSchemas.byIdParams, 'params'),
  async (req, res, next) => {
    try {
      const product = await productRepository.findAdminProductById(req.params.id);

      return res.status(200).json({
        data: toContractProduct(product, toContractMedia(product.images ?? [])),
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.patch(
  '/:id',
  validate(adminProductsSchemas.byIdParams, 'params'),
  validate(adminProductsSchemas.update),
  async (req, res, next) => {
    try {
      const updated = await productRepository.updateAdminProductById(req.params.id, req.body);

      return res.status(200).json({
        data: toContractProduct(updated, toContractMedia(updated.images ?? [])),
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.patch(
  '/:id/publish',
  validate(adminProductsSchemas.byIdParams, 'params'),
  validate(adminProductsSchemas.publish),
  async (req, res, next) => {
    try {
      const updated = await productRepository.publishProductById(req.params.id);

      return res.status(200).json({
        data: {
          id: updated.id,
          status: updated.status,
        },
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.patch(
  '/:id/unpublish',
  validate(adminProductsSchemas.byIdParams, 'params'),
  validate(adminProductsSchemas.unpublish),
  async (req, res, next) => {
    try {
      const updated = await productRepository.unpublishProductById(req.params.id);

      return res.status(200).json({
        data: {
          id: updated.id,
          status: updated.status,
        },
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.put(
  '/:id/media',
  validate(adminProductsSchemas.byIdParams, 'params'),
  validate(adminProductsSchemas.replaceMedia),
  async (req, res, next) => {
    try {
      const duplicateUrlDetails = [];
      const firstSeenUrlIndexes = new Map();
      req.body.media.forEach((item, index) => {
        if (!firstSeenUrlIndexes.has(item.url)) {
          firstSeenUrlIndexes.set(item.url, index);
          return;
        }

        duplicateUrlDetails.push({
          field: `media.${index}.url`,
          message: 'duplicate media url is not allowed within a single media payload',
        });
      });

      if (duplicateUrlDetails.length > 0) {
        throw new ValidationError(duplicateUrlDetails);
      }

      const urls = req.body.media.map((item) => item.url);
      const finalizedAssets = await resolveMediaUploadRepository(req).findFinalizedAssetsByUrls(urls);
      const finalizedUrlSet = new Set(finalizedAssets.map((asset) => asset.url));
      const invalidUrlDetails = req.body.media
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => !finalizedUrlSet.has(item.url))
        .map(({ index }) => ({
          field: `media.${index}.url`,
          message: 'media url must reference a finalized uploaded asset',
        }));

      if (invalidUrlDetails.length > 0) {
        throw new ValidationError(invalidUrlDetails);
      }

      const updated = await productRepository.replaceProductMediaById(req.params.id, req.body.media);

      return res.status(200).json({
        data: {
          id: updated.id,
          media: toContractMedia(updated.images ?? []),
        },
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/stock-adjustments',
  requirePermission('admin:stock:adjust'),
  validate(adminProductsSchemas.adjustStock),
  async (req, res, next) => {
    try {
      const adjustment = await productRepository.applyAdminStockAdjustment({
        actorUserId: req.auth?.sub,
        requestKey: req.body.requestKey,
        intentClass: req.body.intentClass,
        target: req.body.target,
        quantityDelta: req.body.quantityDelta,
        expectedStock: req.body.expectedStock,
        evidenceRef: req.body.evidenceRef,
        note: req.body.note,
      });

      return res.status(200).json({
        data: {
          auditId: adjustment.auditId,
          attemptClass: adjustment.attemptClass,
          outcomeClass: adjustment.outcomeClass,
          rejectionClass: adjustment.rejectionClass,
          replayOfAuditId: adjustment.replayOfAuditId ?? null,
          targetProductId: adjustment.targetProductId ?? null,
          beforeQuantity: adjustment.beforeQuantity ?? null,
          afterQuantity: adjustment.afterQuantity ?? null,
        },
      });
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
