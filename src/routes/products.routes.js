import express from 'express';
import { strictValidate } from '../validation/strict-validate.middleware.js';
import { productsSchemas } from '../validation/schemas/index.js';
import authenticate from '../middlewares/authenticate.js';
import authorizeRole from '../middlewares/authorizeRole.js';
import { catalogueRepository } from '../repositories/catalogue.repository.js';

const router = express.Router();

function toAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function resolveStockStatus(status) {
  return status || 'unknown';
}

function resolveStock(entity) {
  const quantity = entity.stockQuantity ?? entity.stock ?? null;
  return {
    status: resolveStockStatus(entity.stockStatus),
    quantity,
    backorderable: entity.backorderable === true,
  };
}

function buildMeta(req) {
  const meta = {};
  if (req.requestId) meta.requestId = req.requestId;
  if (req.correlationId) meta.correlationId = req.correlationId;
  return Object.keys(meta).length > 0 ? meta : undefined;
}

function sendError(req, res, status, code, message) {
  const payload = { error: { code, message } };
  const meta = buildMeta(req);
  if (meta) payload.meta = meta;
  return res.status(status).json(payload);
}

function parseListQuery(query) {
  const pageValue = query.page ?? '1';
  const pageSizeValue = query.pageSize ?? '24';

  if (!/^[0-9]+$/.test(String(pageValue))) {
    return { error: 'Query param "page" must be an integer greater than or equal to 1.' };
  }
  if (!/^[0-9]+$/.test(String(pageSizeValue))) {
    return { error: 'Query param "pageSize" must be an integer between 1 and 50.' };
  }

  const page = Number.parseInt(String(pageValue), 10);
  const pageSize = Number.parseInt(String(pageSizeValue), 10);

  if (page < 1) {
    return { error: 'Query param "page" must be an integer greater than or equal to 1.' };
  }
  if (pageSize < 1 || pageSize > 50) {
    return { error: 'Query param "pageSize" must be an integer between 1 and 50.' };
  }

  return { page, pageSize };
}

function isValidSlug(slug) {
  if (typeof slug !== 'string') return false;
  if (slug.length < 1 || slug.length > 120) return false;
  return /^[a-z0-9-]+$/.test(slug);
}

router.get('/', async (req, res) => {
  const parsed = parseListQuery(req.query);
  if (parsed.error) {
    return sendError(req, res, 400, 'invalid_request', parsed.error);
  }

  try {
    const result = await catalogueRepository.listProducts({ page: parsed.page, pageSize: parsed.pageSize });
    const items = result.items.map((product) => {
      const primaryImage = Array.isArray(product.images) && product.images.length > 0
        ? {
            url: product.images[0].url,
            alt: product.images[0].alt,
            width: product.images[0].width,
            height: product.images[0].height,
            position: product.images[0].position,
          }
        : null;

      return {
        id: product.id,
        slug: product.slug,
        name: product.name,
        primaryImage,
        pricePreview: {
          amount: toAmount(product.price),
          currency: product.currency,
          isFromPrice: false,
        },
        stock: resolveStock(product),
      };
    });

    const payload = {
      data: {
        items,
        pagination: result.pagination,
      },
    };

    const meta = buildMeta(req);
    if (meta) payload.meta = meta;

    return res.status(200).json(payload);
  } catch (_error) {
    return sendError(req, res, 500, 'internal_error', 'Internal server error.');
  }
});

router.get('/:slug', async (req, res) => {
  const { slug } = req.params;
  if (!isValidSlug(slug)) {
    return sendError(req, res, 400, 'invalid_request', 'Path param "slug" is invalid.');
  }

  try {
    const product = await catalogueRepository.getProductBySlug(slug);
    if (!product) {
      return sendError(req, res, 404, 'not_found', 'Product not found.');
    }

    const hasVariantPricing = Array.isArray(product.variants) && product.variants.some((variant) => variant.priceDelta != null || variant.absolutePrice != null);

    const payload = {
      data: {
        id: product.id,
        slug: product.slug,
        name: product.name,
        description: product.description ?? null,
        images: product.images.map((image) => ({
          url: image.url,
          alt: image.alt,
          width: image.width,
          height: image.height,
          position: image.position,
        })),
        variants: product.variants.map((variant) => ({
          id: variant.id,
          sku: variant.sku,
          label: variant.label,
          attributes: variant.attributes || {},
          priceDelta: variant.priceDelta == null ? null : toAmount(variant.priceDelta),
          absolutePrice: variant.absolutePrice == null ? null : toAmount(variant.absolutePrice),
          stock: {
            status: resolveStockStatus(variant.stockStatus),
            quantity: variant.stockQuantity ?? null,
            backorderable: variant.backorderable === true,
          },
        })),
        basePrice: {
          amount: toAmount(product.price),
          currency: product.currency,
        },
        pricePreview: {
          amount: toAmount(product.price),
          currency: product.currency,
          isFromPrice: hasVariantPricing,
        },
        specs: product.specs.length > 0
          ? product.specs.map((spec) => ({ key: spec.key, value: spec.value }))
          : null,
        stock: resolveStock(product),
      },
    };

    const meta = buildMeta(req);
    if (meta) payload.meta = meta;

    return res.status(200).json(payload);
  } catch (_error) {
    return sendError(req, res, 500, 'internal_error', 'Internal server error.');
  }
});

router.post('/', strictValidate(productsSchemas.create), authenticate, authorizeRole('admin'), (req, res) => res.status(201).json({ data: req.body }));

export default router;