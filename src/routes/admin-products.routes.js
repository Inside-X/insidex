import express from 'express';
import { validate } from '../validation/validate.middleware.js';
import { adminProductsSchemas } from '../validation/schemas/admin-products.schema.js';
import { productRepository } from '../repositories/product.repository.js';

const router = express.Router();

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

export default router;