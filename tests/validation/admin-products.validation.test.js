import { expect, test } from '@jest/globals';

import { adminProductsSchemas } from '../../src/validation/schemas/admin-products.schema.js';

const validMediaItem = {
  id: 'media_001',
  url: 'https://cdn.example.com/products/amani-chair/main.jpg',
  alt: 'Amani Chair front view',
  sortOrder: 0,
  isPrimary: true,
  kind: 'image',
};

const validCreatePayload = {
  name: 'Amani Chair',
  slug: 'amani-chair',
  shortDescription: 'Oak chair with woven seat.',
  description: 'Full product description.',
  price: '129.90',
  currency: 'EUR',
  stock: 8,
  status: 'draft',
  media: [validMediaItem],
};

test('create accepts a valid admin product payload', () => {
  expect(adminProductsSchemas.create.parse(validCreatePayload)).toEqual(validCreatePayload);
});

test('create rejects invalid price format', () => {
  const result = adminProductsSchemas.create.safeParse({ ...validCreatePayload, price: '129.9' });
  expect(result.success).toBe(false);
});

test('create rejects non-EUR currency', () => {
  const result = adminProductsSchemas.create.safeParse({ ...validCreatePayload, currency: 'USD' });
  expect(result.success).toBe(false);
});

test('create rejects negative stock', () => {
  const result = adminProductsSchemas.create.safeParse({ ...validCreatePayload, stock: -1 });
  expect(result.success).toBe(false);
});

test('update rejects unknown fields', () => {
  const result = adminProductsSchemas.update.safeParse({ unknown: 'field' });
  expect(result.success).toBe(false);
});

test('byIdParams rejects invalid UUID', () => {
  const result = adminProductsSchemas.byIdParams.safeParse({ id: 'not-a-uuid' });
  expect(result.success).toBe(false);
});

test('replaceMedia accepts a valid zero-primary media list', () => {
  const payload = {
    media: [
      { ...validMediaItem, id: 'media_001', isPrimary: false, sortOrder: 0 },
      { ...validMediaItem, id: 'media_002', url: 'https://cdn.example.com/products/amani-chair/side.jpg', alt: 'Amani Chair side view', isPrimary: false, sortOrder: 1 },
    ],
  };

  expect(adminProductsSchemas.replaceMedia.parse(payload)).toEqual(payload);
});

test('replaceMedia rejects duplicate media ids', () => {
  const result = adminProductsSchemas.replaceMedia.safeParse({
    media: [
      { ...validMediaItem, id: 'media_001', sortOrder: 0 },
      { ...validMediaItem, id: 'media_001', sortOrder: 1, isPrimary: false },
    ],
  });

  expect(result.success).toBe(false);
});

test('replaceMedia rejects duplicate sortOrder', () => {
  const result = adminProductsSchemas.replaceMedia.safeParse({
    media: [
      { ...validMediaItem, id: 'media_001', sortOrder: 0 },
      { ...validMediaItem, id: 'media_002', sortOrder: 0, isPrimary: false },
    ],
  });

  expect(result.success).toBe(false);
});

test('replaceMedia rejects multiple primary items', () => {
  const result = adminProductsSchemas.replaceMedia.safeParse({
    media: [
      { ...validMediaItem, id: 'media_001', sortOrder: 0, isPrimary: true },
      { ...validMediaItem, id: 'media_002', sortOrder: 1, isPrimary: true },
    ],
  });

  expect(result.success).toBe(false);
});

test('replaceMedia rejects unknown media item fields', () => {
  const result = adminProductsSchemas.replaceMedia.safeParse({
    media: [{ ...validMediaItem, extra: 'nope' }],
  });

  expect(result.success).toBe(false);
});

test('publish and unpublish accept an empty object only', () => {
  expect(adminProductsSchemas.publish.parse({})).toEqual({});
  expect(adminProductsSchemas.unpublish.parse({})).toEqual({});
  expect(adminProductsSchemas.publish.safeParse({ noop: true }).success).toBe(false);
  expect(adminProductsSchemas.unpublish.safeParse({ noop: true }).success).toBe(false);
});

test('adjustStock accepts canonical productId target payload', () => {
  const payload = {
    target: { productId: '00000000-0000-0000-0000-000000000123' },
    intentClass: 'RECOUNT_CORRECTION',
    quantityDelta: -2,
    expectedStock: 8,
    evidenceRef: 'cycle-count-2026-04-16',
    note: 'Shelf recount matched signed worksheet.',
  };

  expect(adminProductsSchemas.adjustStock.parse(payload)).toEqual(payload);
});

test('adjustStock rejects ambiguous target payload', () => {
  const result = adminProductsSchemas.adjustStock.safeParse({
    target: {
      productId: '00000000-0000-0000-0000-000000000123',
      sku: 'SKU-123',
    },
    intentClass: 'RECOUNT_CORRECTION',
    quantityDelta: -1,
    expectedStock: 8,
  });

  expect(result.success).toBe(false);
});

test('adjustStock rejects unsupported or missing intent class', () => {
  expect(adminProductsSchemas.adjustStock.safeParse({
    target: { sku: 'SKU-123' },
    quantityDelta: -1,
    expectedStock: 8,
  }).success).toBe(false);
  expect(adminProductsSchemas.adjustStock.safeParse({
    target: { sku: 'SKU-123' },
    intentClass: 'FIX_STOCK',
    quantityDelta: -1,
    expectedStock: 8,
  }).success).toBe(false);
});
