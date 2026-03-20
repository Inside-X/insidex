import express from 'express';
import { validate } from '../validation/validate.middleware.js';
import { adminProductsSchemas } from '../validation/schemas/admin-products.schema.js';

const router = express.Router();

function buildPlaceholderProduct({ id, payload, existingMedia = [] }) {
  return {
    id,
    name: payload.name ?? 'placeholder-product',
    slug: payload.slug ?? 'placeholder-product',
    ...(payload.shortDescription !== undefined ? { shortDescription: payload.shortDescription } : {}),
    description: payload.description ?? 'placeholder description',
    price: payload.price ?? '0.00',
    currency: payload.currency ?? 'EUR',
    stock: payload.stock ?? 0,
    status: payload.status ?? 'draft',
    media: payload.media ?? existingMedia,
  };
}

router.post(
  '/',
  validate(adminProductsSchemas.create),
  (req, res) => res.status(201).json({
    data: buildPlaceholderProduct({
      id: 'prod_placeholder_create',
      payload: req.body,
    }),
  }),
);

router.patch(
  '/:id',
  validate(adminProductsSchemas.byIdParams, 'params'),
  validate(adminProductsSchemas.update),
  (req, res) => res.status(200).json({
    data: buildPlaceholderProduct({
      id: req.params.id,
      payload: req.body,
    }),
  }),
);

router.patch(
  '/:id/publish',
  validate(adminProductsSchemas.byIdParams, 'params'),
  validate(adminProductsSchemas.publish),
  (req, res) => res.status(200).json({
    data: {
      id: req.params.id,
      status: 'published',
    },
  }),
);

router.patch(
  '/:id/unpublish',
  validate(adminProductsSchemas.byIdParams, 'params'),
  validate(adminProductsSchemas.unpublish),
  (req, res) => res.status(200).json({
    data: {
      id: req.params.id,
      status: 'draft',
    },
  }),
);

router.put(
  '/:id/media',
  validate(adminProductsSchemas.byIdParams, 'params'),
  validate(adminProductsSchemas.replaceMedia),
  (req, res) => res.status(200).json({
    data: {
      id: req.params.id,
      media: req.body.media,
    },
  }),
);

export default router;
