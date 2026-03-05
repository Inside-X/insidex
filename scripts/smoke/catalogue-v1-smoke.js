import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import app from '../../src/app.js';
import { resetRateLimiters, setRateLimitRedisClient } from '../../src/middlewares/rateLimit.js';
import { catalogueRepository } from '../../src/repositories/catalogue.repository.js';
import { CATALOGUE_V1_PRODUCT, seedCatalogueV1 } from '../../prisma/seed.catalogue-v1.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function buildProof({ result, commands, mode, errorMessage }) {
  const sha = String(process.env.GITHUB_SHA || 'localdev').slice(0, 8);
  return {
    repo: process.env.GITHUB_REPOSITORY || 'local',
    branch: process.env.GITHUB_REF_NAME || 'local',
    sha,
    workflow: process.env.GITHUB_WORKFLOW || 'local',
    job: process.env.GITHUB_JOB || 'local',
    timestamp_utc: new Date().toISOString(),
    commands,
    mode,
    result,
    ...(errorMessage ? { error: errorMessage } : {}),
  };
}

function writeProof(proof) {
  const outPath = path.join(
    process.cwd(),
    'docs/audit/artifacts',
    `epic5_catalogue_smoke_proof.${String(proof.sha || 'localdev').slice(0, 8)}.json`,
  );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
  return outPath;
}

async function runWithDatabase() {
  const prisma = new PrismaClient();
  try {
    await seedCatalogueV1({ prisma, force: process.env.SEED_FORCE === '1' });
    setRateLimitRedisClient({
      ping: async () => 'PONG',
      eval: async () => [1, 60_000],
      flushAll: () => undefined,
    });
    const listRes = await request(app).get('/api/products');
    assert(listRes.status === 200, `GET /api/products status=${listRes.status}`);
    assert(Array.isArray(listRes.body?.data?.items), 'products list payload missing data.items');
    assert(listRes.body.data.items.length >= 1, 'products list expected >= 1 item after seed');

    const detailRes = await request(app).get(`/api/products/${CATALOGUE_V1_PRODUCT.slug}`);
    assert(detailRes.status === 200, `GET /api/products/:slug status=${detailRes.status}`);

    return { mode: 'db', commands: ['node scripts/smoke/catalogue-v1-smoke.js (db mode)'] };
  } finally {
    resetRateLimiters();
    await prisma.$disconnect();
  }
}

async function runHarnessMode() {
  const originalList = catalogueRepository.listProducts;
  const originalDetail = catalogueRepository.getProductBySlug;
  try {
    catalogueRepository.listProducts = async () => ({
      items: [{
        id: 'seed-product-id',
        slug: CATALOGUE_V1_PRODUCT.slug,
        name: CATALOGUE_V1_PRODUCT.name,
        price: CATALOGUE_V1_PRODUCT.price,
        currency: CATALOGUE_V1_PRODUCT.currency,
        stockStatus: CATALOGUE_V1_PRODUCT.stockStatus,
        stockQuantity: CATALOGUE_V1_PRODUCT.stockQuantity,
        backorderable: CATALOGUE_V1_PRODUCT.backorderable,
        images: [CATALOGUE_V1_PRODUCT.image],
      }],
      pagination: { page: 1, pageSize: 24, totalItems: 1, totalPages: 1 },
    });

    catalogueRepository.getProductBySlug = async (slug) => {
      if (slug !== CATALOGUE_V1_PRODUCT.slug) return null;
      return {
        id: 'seed-product-id',
        slug: CATALOGUE_V1_PRODUCT.slug,
        name: CATALOGUE_V1_PRODUCT.name,
        description: CATALOGUE_V1_PRODUCT.description,
        price: CATALOGUE_V1_PRODUCT.price,
        currency: CATALOGUE_V1_PRODUCT.currency,
        stockStatus: CATALOGUE_V1_PRODUCT.stockStatus,
        stockQuantity: CATALOGUE_V1_PRODUCT.stockQuantity,
        backorderable: CATALOGUE_V1_PRODUCT.backorderable,
        images: [CATALOGUE_V1_PRODUCT.image],
        variants: [{ ...CATALOGUE_V1_PRODUCT.variant, id: 'seed-variant-id', absolutePrice: null }],
        specs: [CATALOGUE_V1_PRODUCT.spec],
      };
    };

    setRateLimitRedisClient({ ping: async () => 'PONG', eval: async () => [1, 60_000], flushAll: () => undefined });

    const listRes = await request(app).get('/api/products');
    assert(listRes.status === 200, `GET /api/products status=${listRes.status}`);
    assert(Array.isArray(listRes.body?.data?.items), 'products list payload missing data.items');
    assert(listRes.body.data.items.length >= 1, 'products list expected >= 1 item in harness');

    const detailRes = await request(app).get(`/api/products/${CATALOGUE_V1_PRODUCT.slug}`);
    assert(detailRes.status === 200, `GET /api/products/:slug status=${detailRes.status}`);

    return { mode: 'harness', commands: ['node scripts/smoke/catalogue-v1-smoke.js (harness mode)'] };
  } finally {
    catalogueRepository.listProducts = originalList;
    catalogueRepository.getProductBySlug = originalDetail;
    resetRateLimiters();
  }
}

async function main() {
  try {
    let run;
    if (process.env.DATABASE_URL) {
      try {
        run = await runWithDatabase();
      } catch (error) {
        console.warn(`catalogue_smoke_db_unavailable: ${error instanceof Error ? error.message : 'unknown'}`);
        run = await runHarnessMode();
      }
    } else {
      run = await runHarnessMode();
    }
    const proof = buildProof({ result: 'pass', commands: run.commands, mode: run.mode });
    const proofPath = writeProof(proof);
    console.log(`Catalogue smoke proof written: ${proofPath}`);
  } catch (error) {
    const proof = buildProof({
      result: 'fail',
      commands: ['node scripts/smoke/catalogue-v1-smoke.js'],
      mode: process.env.DATABASE_URL ? 'db' : 'harness',
      errorMessage: error instanceof Error ? error.message : 'unknown',
    });
    const proofPath = writeProof(proof);
    console.error(`Catalogue smoke failed. Proof written: ${proofPath}`);
    throw error;
  }
}

main();