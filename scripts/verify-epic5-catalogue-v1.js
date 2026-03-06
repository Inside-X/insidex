import 'dotenv/config';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../src/app.js';
import { seedCatalogueV1, CATALOGUE_V1_PRODUCTS } from '../prisma/seed.catalogue-v1.js';
import { resetRateLimiters, setRateLimitRedisClient } from '../src/middlewares/rateLimit.js';

const MAX_FAILURES = 10;

function pushFailure(failures, message) {
  if (failures.length < MAX_FAILURES) {
    failures.push(message);
  }
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

async function main() {
  const failures = [];
  const prisma = new PrismaClient();

  try {
    await seedCatalogueV1({ prisma, log: () => undefined });

    setRateLimitRedisClient({
      ping: async () => 'PONG',
      eval: async () => [1, 60_000],
      flushAll: async () => undefined,
    });

    const seededSlugs = CATALOGUE_V1_PRODUCTS.map((product) => product.slug);
    const productB = CATALOGUE_V1_PRODUCTS.find((product) => product.variants.length >= 2);

    const listResA = await request(app).get('/api/products?page=1&pageSize=24');
    const listResB = await request(app).get('/api/products?page=1&pageSize=24');

    if (listResA.status !== 200) {
      pushFailure(failures, `GET /api/products expected 200, got ${listResA.status}`);
    }

    const topKeys = Object.keys(listResA.body || {});
    if (!(topKeys.length >= 1 && topKeys[0] === 'data')) {
      pushFailure(failures, `GET /api/products envelope must start with data key, got keys=${JSON.stringify(topKeys)}`);
    }

    if (!hasOwn(listResA.body, 'data') || typeof listResA.body.data !== 'object' || listResA.body.data === null) {
      pushFailure(failures, 'GET /api/products missing data object');
    }

    const items = listResA.body?.data?.items;
    const pagination = listResA.body?.data?.pagination;

    if (!Array.isArray(items)) {
      pushFailure(failures, 'GET /api/products data.items must be an array');
    }

    if (!pagination || typeof pagination !== 'object') {
      pushFailure(failures, 'GET /api/products data.pagination must be an object');
    }

    if (Array.isArray(items)) {
      const listSlugs = items.map((item) => item?.slug);
      if (JSON.stringify(listResA.body?.data?.items) !== JSON.stringify(listResB.body?.data?.items)) {
        pushFailure(failures, 'GET /api/products ordering is not stable across repeated requests');
      }

      for (const expectedSlug of seededSlugs) {
        if (!listSlugs.includes(expectedSlug)) {
          pushFailure(failures, `GET /api/products missing seeded slug=${expectedSlug}`);
        }
      }

      for (const [index, item] of items.entries()) {
        for (const requiredKey of ['id', 'slug', 'name', 'primaryImage', 'pricePreview', 'stock']) {
          if (!hasOwn(item, requiredKey)) {
            pushFailure(failures, `GET /api/products item[${index}] missing key=${requiredKey}`);
          }
        }

        if (item?.primaryImage !== null) {
          for (const requiredImageKey of ['url', 'alt', 'width', 'height', 'position']) {
            if (!hasOwn(item.primaryImage, requiredImageKey)) {
              pushFailure(failures, `GET /api/products item[${index}] primaryImage missing key=${requiredImageKey}`);
            }
          }
        }
      }
    }

    for (const slug of seededSlugs) {
      const detailRes = await request(app).get(`/api/products/${slug}`);
      if (detailRes.status !== 200) {
        pushFailure(failures, `GET /api/products/${slug} expected 200, got ${detailRes.status}`);
        continue;
      }

      const detail = detailRes.body?.data;
      for (const requiredKey of ['id', 'slug', 'name', 'images', 'variants', 'basePrice', 'pricePreview', 'stock']) {
        if (!hasOwn(detail, requiredKey)) {
          pushFailure(failures, `GET /api/products/${slug} missing detail key=${requiredKey}`);
        }
      }

      if (Array.isArray(detail?.images)) {
        let previous = null;
        for (const image of detail.images) {
          for (const requiredImageKey of ['url', 'alt', 'width', 'height', 'position']) {
            if (!hasOwn(image, requiredImageKey)) {
              pushFailure(failures, `GET /api/products/${slug} image missing key=${requiredImageKey}`);
            }
          }

          const currentOrder = `${image.position}:${image.url}`;
          if (previous && previous > currentOrder) {
            pushFailure(failures, `GET /api/products/${slug} images are not deterministically ordered by position`);
            break;
          }
          previous = currentOrder;
        }
      } else {
        pushFailure(failures, `GET /api/products/${slug} images must be array`);
      }
    }

    if (productB) {
      const detailResB = await request(app).get(`/api/products/${productB.slug}`);
      const variants = detailResB.body?.data?.variants;
      if (!Array.isArray(variants) || variants.length < 2) {
        pushFailure(failures, `GET /api/products/${productB.slug} must expose at least 2 variants`);
      } else if (!variants.some((variant) => variant?.stock?.status === 'out_of_stock')) {
        pushFailure(failures, `GET /api/products/${productB.slug} must include one out_of_stock variant`);
      }
    }

    const invalidSlugRes = await request(app).get('/api/products/INVALID_SLUG');
    if (invalidSlugRes.status !== 400) {
      pushFailure(failures, `GET /api/products/INVALID_SLUG expected 400, got ${invalidSlugRes.status}`);
    }
    if (invalidSlugRes.body?.error?.code !== 'invalid_request') {
      pushFailure(failures, 'GET /api/products/INVALID_SLUG must return error.code=invalid_request');
    }

    const unknownSlugRes = await request(app).get('/api/products/not-existing-seeded-slug');
    if (unknownSlugRes.status !== 404) {
      pushFailure(failures, `GET /api/products/not-existing-seeded-slug expected 404, got ${unknownSlugRes.status}`);
    }
    if (unknownSlugRes.body?.error?.code !== 'not_found') {
      pushFailure(failures, 'GET /api/products/not-existing-seeded-slug must return error.code=not_found');
    }

    if (failures.length > 0) {
      console.error('[epic5.1c:verify] failed with bounded diagnostics:');
      failures.forEach((failure, index) => console.error(`  ${index + 1}. ${failure}`));
      process.exitCode = 1;
      return;
    }

    console.log('[epic5.1c:verify] PASS');
  } finally {
    resetRateLimiters();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[epic5.1c:verify] fatal:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});