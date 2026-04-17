import { jest } from '@jest/globals';

async function loadProductRepository({ normalizeImpl } = {}) {
  jest.resetModules();

  const prismaMock = {
    $transaction: jest.fn(),
    product: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    productVariant: {
      findUnique: jest.fn(),
    },
    adminStockAdjustmentAudit: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  const normalizeDbError = jest.fn(normalizeImpl || ((error) => {
    throw error;
  }));

  await jest.unstable_mockModule('../../src/lib/prisma.js', () => ({ default: prismaMock }));
  await jest.unstable_mockModule('../../src/lib/db-error.js', () => ({ normalizeDbError }));

  const { productRepository } = await import('../../src/repositories/product.repository.js');
  return { productRepository, prismaMock, normalizeDbError };
}

describe('productRepository', () => {
  test.each([
    ['create', 'create', [{ name: 'Widget', price: '2.50' }], { data: { name: 'Widget', price: '2.50' } }],
    ['findById', 'findUnique', ['p1'], { where: { id: 'p1' } }],
    ['update', 'update', ['p1', { active: false }], { where: { id: 'p1' }, data: { active: false } }],
    ['delete', 'delete', ['p1'], { where: { id: 'p1' } }],
  ])('%s success path', async (method, op, args, expectedCall) => {
    const { productRepository, prismaMock, normalizeDbError } = await loadProductRepository();
    const expected = { id: 'ok' };
    prismaMock.product[op].mockResolvedValueOnce(expected);

    await expect(productRepository[method](...args)).resolves.toEqual(expected);
    expect(prismaMock.product[op]).toHaveBeenCalledWith(expectedCall);
    expect(normalizeDbError).not.toHaveBeenCalled();
  });

  test.each([
    ['create', 'create', [{ name: 'x' }], 'create'],
    ['findById', 'findUnique', ['p1'], 'findById'],
    ['update', 'update', ['p1', { active: true }], 'update'],
    ['delete', 'delete', ['p1'], 'delete'],
    ['list', 'findMany', [{ where: { active: true } }], 'list'],
  ])('%s failure path routes through normalizeDbError', async (method, op, args, operation) => {
    const { productRepository, prismaMock, normalizeDbError } = await loadProductRepository();
    const dbError = new Error('deadlock detected');
    prismaMock.product[op].mockRejectedValueOnce(dbError);

    await expect(productRepository[method](...args)).rejects.toThrow(dbError);
    expect(normalizeDbError).toHaveBeenCalledWith(dbError, { repository: 'product', operation });
  });

  test('applyAdminStockAdjustment applies a single deterministic mutation with authoritative audit write', async () => {
    const { productRepository, prismaMock } = await loadProductRepository();
    prismaMock.$transaction.mockImplementationOnce((callback) => callback(prismaMock));
    prismaMock.productVariant.findUnique.mockResolvedValueOnce({ productId: 'prod_1' });
    prismaMock.product.findUnique.mockResolvedValueOnce({ id: 'prod_1', stock: 8 });
    prismaMock.product.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.adminStockAdjustmentAudit.create.mockResolvedValueOnce({ id: 'audit_1' });

    const result = await productRepository.applyAdminStockAdjustment({
      actorUserId: '00000000-0000-0000-0000-000000000001',
      requestKey: '11111111-1111-4111-8111-111111111111',
      intentClass: 'RECOUNT_CORRECTION',
      target: { sku: 'SKU-1' },
      quantityDelta: -2,
      expectedStock: 8,
      evidenceRef: 'cycle-count-1',
      note: 'verified',
    });

    expect(prismaMock.product.updateMany).toHaveBeenCalledWith({
      where: { id: 'prod_1', stock: 8 },
      data: { stock: 6 },
    });
    expect(prismaMock.adminStockAdjustmentAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: '00000000-0000-0000-0000-000000000001',
        requestKey: '11111111-1111-4111-8111-111111111111',
        targetProductId: 'prod_1',
        targetResolverSku: 'SKU-1',
        intentClass: 'RECOUNT_CORRECTION',
        requestedQuantityDelta: -2,
        requestedExpectedStock: 8,
        beforeQuantity: 8,
        afterQuantity: 6,
        attemptClass: 'NEW_INTENDED_ADJUSTMENT',
        outcomeClass: 'APPLIED',
      }),
    });
    expect(result).toEqual({
      applied: true,
      attemptClass: 'NEW_INTENDED_ADJUSTMENT',
      outcomeClass: 'APPLIED',
      rejectionClass: null,
      targetProductId: 'prod_1',
      beforeQuantity: 8,
      afterQuantity: 6,
      auditId: 'audit_1',
    });
  });

  test('applyAdminStockAdjustment rejects invalid precondition with audit and no stock mutation', async () => {
    const { productRepository, prismaMock } = await loadProductRepository();
    prismaMock.$transaction.mockImplementationOnce((callback) => callback(prismaMock));
    prismaMock.product.findUnique.mockResolvedValueOnce({ id: 'prod_1', stock: 8 });
    prismaMock.adminStockAdjustmentAudit.create.mockResolvedValueOnce({ id: 'audit_2' });

    const result = await productRepository.applyAdminStockAdjustment({
      actorUserId: '00000000-0000-0000-0000-000000000001',
      requestKey: '22222222-2222-4222-8222-222222222222',
      intentClass: 'DAMAGE_LOSS_CORRECTION',
      target: { productId: 'prod_1' },
      quantityDelta: -2,
      expectedStock: 7,
    });

    expect(prismaMock.product.updateMany).not.toHaveBeenCalled();
    expect(result).toEqual({
      applied: false,
      attemptClass: 'NEW_INTENDED_ADJUSTMENT',
      outcomeClass: 'REJECTED',
      rejectionClass: 'INVALID_PRECONDITION',
      targetProductId: 'prod_1',
      beforeQuantity: 8,
      auditId: 'audit_2',
    });
  });

  test('applyAdminStockAdjustment rejects invalid target deterministically with audit', async () => {
    const { productRepository, prismaMock } = await loadProductRepository();
    prismaMock.$transaction.mockImplementationOnce((callback) => callback(prismaMock));
    prismaMock.productVariant.findUnique.mockResolvedValueOnce(null);
    prismaMock.adminStockAdjustmentAudit.create.mockResolvedValueOnce({ id: 'audit_3' });

    const result = await productRepository.applyAdminStockAdjustment({
      actorUserId: '00000000-0000-0000-0000-000000000001',
      requestKey: '33333333-3333-4333-8333-333333333333',
      intentClass: 'RECOUNT_CORRECTION',
      target: { sku: 'MISSING-SKU' },
      quantityDelta: -1,
      expectedStock: 8,
    });

    expect(prismaMock.product.findUnique).not.toHaveBeenCalled();
    expect(result).toEqual({
      applied: false,
      attemptClass: 'NEW_INTENDED_ADJUSTMENT',
      outcomeClass: 'REJECTED',
      rejectionClass: 'INVALID_TARGET',
      auditId: 'audit_3',
    });
  });

  test('applyAdminStockAdjustment replays prior authoritative outcome without second stock mutation', async () => {
    const { productRepository, prismaMock } = await loadProductRepository();
    prismaMock.$transaction.mockImplementationOnce((callback) => callback(prismaMock));
    prismaMock.productVariant.findUnique.mockResolvedValueOnce({ productId: 'prod_1' });
    prismaMock.adminStockAdjustmentAudit.findFirst.mockResolvedValueOnce({
      id: 'audit_prior',
      targetProductId: 'prod_1',
      intentClass: 'RECOUNT_CORRECTION',
      requestedQuantityDelta: -2,
      requestedExpectedStock: 8,
      evidenceRef: 'cycle-count-1',
      beforeQuantity: 8,
      afterQuantity: 6,
      outcomeClass: 'APPLIED',
      rejectionClass: null,
    });
    prismaMock.adminStockAdjustmentAudit.create.mockResolvedValueOnce({ id: 'audit_replay' });

    const result = await productRepository.applyAdminStockAdjustment({
      actorUserId: '00000000-0000-0000-0000-000000000001',
      requestKey: '44444444-4444-4444-8444-444444444444',
      intentClass: 'RECOUNT_CORRECTION',
      target: { sku: 'SKU-1' },
      quantityDelta: -2,
      expectedStock: 8,
      evidenceRef: 'cycle-count-1',
    });

    expect(prismaMock.product.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.product.updateMany).not.toHaveBeenCalled();
    expect(result).toEqual({
      applied: false,
      attemptClass: 'REPLAYED_PRIOR_OUTCOME',
      outcomeClass: 'APPLIED',
      rejectionClass: null,
      targetProductId: 'prod_1',
      beforeQuantity: 8,
      afterQuantity: 6,
      replayOfAuditId: 'audit_prior',
      auditId: 'audit_replay',
    });
  });

  test('applyAdminStockAdjustment classifies non-same request key reuse as duplicate and fails closed', async () => {
    const { productRepository, prismaMock } = await loadProductRepository();
    prismaMock.$transaction.mockImplementationOnce((callback) => callback(prismaMock));
    prismaMock.productVariant.findUnique.mockResolvedValueOnce({ productId: 'prod_1' });
    prismaMock.adminStockAdjustmentAudit.findFirst.mockResolvedValueOnce({
      id: 'audit_prior',
      targetProductId: 'prod_1',
      intentClass: 'RECOUNT_CORRECTION',
      requestedQuantityDelta: -1,
      requestedExpectedStock: 8,
      evidenceRef: null,
      beforeQuantity: 8,
      afterQuantity: 7,
      outcomeClass: 'APPLIED',
      rejectionClass: null,
    });
    prismaMock.adminStockAdjustmentAudit.create.mockResolvedValueOnce({ id: 'audit_duplicate' });

    const result = await productRepository.applyAdminStockAdjustment({
      actorUserId: '00000000-0000-0000-0000-000000000001',
      requestKey: '55555555-5555-4555-8555-555555555555',
      intentClass: 'RECOUNT_CORRECTION',
      target: { sku: 'SKU-1' },
      quantityDelta: -2,
      expectedStock: 8,
    });

    expect(prismaMock.product.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.product.updateMany).not.toHaveBeenCalled();
    expect(result).toEqual({
      applied: false,
      attemptClass: 'DUPLICATE_REQUEST',
      outcomeClass: 'REJECTED',
      rejectionClass: 'INVALID_PRECONDITION',
      targetProductId: 'prod_1',
      replayOfAuditId: 'audit_prior',
      auditId: 'audit_duplicate',
    });
  });

  test('applyAdminStockAdjustment marks unresolved target replay-key reuse as duplicate and rejects fail-closed', async () => {
    const { productRepository, prismaMock } = await loadProductRepository();
    prismaMock.$transaction.mockImplementationOnce((callback) => callback(prismaMock));
    prismaMock.productVariant.findUnique.mockResolvedValueOnce(null);
    prismaMock.adminStockAdjustmentAudit.findFirst.mockResolvedValueOnce({
      id: 'audit_prior',
      targetProductId: null,
      intentClass: 'RECOUNT_CORRECTION',
      requestedQuantityDelta: -1,
      requestedExpectedStock: 8,
      evidenceRef: null,
      beforeQuantity: null,
      afterQuantity: null,
      outcomeClass: 'REJECTED',
      rejectionClass: 'INVALID_TARGET',
    });
    prismaMock.adminStockAdjustmentAudit.create.mockResolvedValueOnce({ id: 'audit_duplicate_target' });

    const result = await productRepository.applyAdminStockAdjustment({
      actorUserId: '00000000-0000-0000-0000-000000000001',
      requestKey: '66666666-6666-4666-8666-666666666666',
      intentClass: 'RECOUNT_CORRECTION',
      target: { sku: 'MISSING-SKU' },
      quantityDelta: -1,
      expectedStock: 8,
    });

    expect(prismaMock.product.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.product.updateMany).not.toHaveBeenCalled();
    expect(result).toEqual({
      applied: false,
      attemptClass: 'DUPLICATE_REQUEST',
      outcomeClass: 'REJECTED',
      rejectionClass: 'INVALID_TARGET',
      auditId: 'audit_duplicate_target',
    });
  });

  test('applyAdminStockAdjustment replays prior rejected outcome without mutation', async () => {
    const { productRepository, prismaMock } = await loadProductRepository();
    prismaMock.$transaction.mockImplementationOnce((callback) => callback(prismaMock));
    prismaMock.product.findUnique.mockResolvedValueOnce({ id: 'prod_1', stock: 8 });
    prismaMock.adminStockAdjustmentAudit.findFirst.mockResolvedValueOnce({
      id: 'audit_prior_rejected',
      targetProductId: 'prod_1',
      intentClass: 'DAMAGE_LOSS_CORRECTION',
      requestedQuantityDelta: -2,
      requestedExpectedStock: 10,
      evidenceRef: null,
      beforeQuantity: 8,
      afterQuantity: null,
      outcomeClass: 'REJECTED',
      rejectionClass: 'INVALID_PRECONDITION',
    });
    prismaMock.adminStockAdjustmentAudit.create.mockResolvedValueOnce({ id: 'audit_replay_rejected' });

    const result = await productRepository.applyAdminStockAdjustment({
      actorUserId: '00000000-0000-0000-0000-000000000001',
      requestKey: '77777777-7777-4777-8777-777777777777',
      intentClass: 'DAMAGE_LOSS_CORRECTION',
      target: { productId: 'prod_1' },
      quantityDelta: -2,
      expectedStock: 10,
    });

    expect(prismaMock.product.updateMany).not.toHaveBeenCalled();
    expect(result).toEqual({
      applied: false,
      attemptClass: 'REPLAYED_PRIOR_OUTCOME',
      outcomeClass: 'REJECTED',
      rejectionClass: 'INVALID_PRECONDITION',
      targetProductId: 'prod_1',
      beforeQuantity: 8,
      afterQuantity: null,
      replayOfAuditId: 'audit_prior_rejected',
      auditId: 'audit_replay_rejected',
    });
  });

  test('list defaults', async () => {
    const { productRepository, prismaMock } = await loadProductRepository();
    prismaMock.product.findMany.mockResolvedValueOnce([]);

    await expect(productRepository.list()).resolves.toEqual([]);
    expect(prismaMock.product.findMany).toHaveBeenCalledWith({
      skip: 0,
      take: 50,
      where: {},
      orderBy: { createdAt: 'desc' },
    });
  });

  test('list with explicit large pagination', async () => {
    const { productRepository, prismaMock } = await loadProductRepository();
    const params = { skip: 10000, take: 1000, where: { active: false }, orderBy: { createdAt: 'asc' } };
    prismaMock.product.findMany.mockResolvedValueOnce([{ id: 'p2' }]);

    await expect(productRepository.list(params)).resolves.toEqual([{ id: 'p2' }]);
    expect(prismaMock.product.findMany).toHaveBeenCalledWith(params);
  });

  test('createAdminProduct delegates correctly with faithful product and media persistence', async () => {
    const { productRepository, prismaMock, normalizeDbError } = await loadProductRepository();
    const payload = {
      name: 'Amani Chair',
      slug: 'amani-chair',
      shortDescription: 'Oak chair with woven seat.',
      description: 'Full product description.',
      price: '129.90',
      currency: 'EUR',
      stock: 8,
      status: 'draft',
      media: [
        {
          id: 'media_001',
          url: 'https://cdn.example.com/products/amani-chair/main.jpg',
          alt: 'Amani Chair front view',
          sortOrder: 0,
          isPrimary: true,
          kind: 'image',
        },
      ],
    };
    const expected = { id: 'prod_1' };
    prismaMock.product.create.mockResolvedValueOnce(expected);

    await expect(productRepository.createAdminProduct(payload)).resolves.toEqual(expected);
    expect(prismaMock.product.create).toHaveBeenCalledWith({
      data: {
        name: 'Amani Chair',
        slug: 'amani-chair',
        shortDescription: 'Oak chair with woven seat.',
        description: 'Full product description.',
        price: '129.90',
        currency: 'EUR',
        stock: 8,
        status: 'draft',
        images: {
          create: [
            {
              id: 'media_001',
              url: 'https://cdn.example.com/products/amani-chair/main.jpg',
              alt: 'Amani Chair front view',
              isPrimary: true,
              kind: 'image',
              position: 0,
            },
          ],
        },
      },
      include: {
        images: {
          orderBy: { position: 'asc' },
        },
      },
    });
    expect(normalizeDbError).not.toHaveBeenCalled();
  });

  test('updateAdminProductById delegates correctly with shortDescription and published status', async () => {
    const { productRepository, prismaMock } = await loadProductRepository();
    prismaMock.product.update.mockResolvedValueOnce({ id: 'prod_1' });

    await productRepository.updateAdminProductById('prod_1', {
      name: 'Amani Lounge Chair',
      slug: 'amani-lounge-chair',
      shortDescription: 'Updated short summary.',
      description: 'Updated description.',
      price: '149.90',
      currency: 'EUR',
      stock: 5,
      status: 'published',
    });

    expect(prismaMock.product.update).toHaveBeenCalledWith({
      where: { id: 'prod_1' },
      data: {
        name: 'Amani Lounge Chair',
        slug: 'amani-lounge-chair',
        shortDescription: 'Updated short summary.',
        description: 'Updated description.',
        price: '149.90',
        currency: 'EUR',
        stock: 5,
        status: 'published',
      },
      include: {
        images: {
          orderBy: { position: 'asc' },
        },
      },
    });
  });

  test('publishProductById delegates correctly', async () => {
    const { productRepository, prismaMock } = await loadProductRepository();
    prismaMock.product.update.mockResolvedValueOnce({ id: 'prod_1', status: 'published' });

    await productRepository.publishProductById('prod_1');

    expect(prismaMock.product.update).toHaveBeenCalledWith({
      where: { id: 'prod_1' },
      data: { status: 'published' },
    });
  });

  test('unpublishProductById delegates correctly', async () => {
    const { productRepository, prismaMock } = await loadProductRepository();
    prismaMock.product.update.mockResolvedValueOnce({ id: 'prod_1', status: 'draft' });

    await productRepository.unpublishProductById('prod_1');

    expect(prismaMock.product.update).toHaveBeenCalledWith({
      where: { id: 'prod_1' },
      data: { status: 'draft' },
    });
  });

  test('replaceProductMediaById delegates correctly with explicit deterministic ordering and faithful media fields', async () => {
    const { productRepository, prismaMock } = await loadProductRepository();
    prismaMock.product.update.mockResolvedValueOnce({ id: 'prod_1' });

    await productRepository.replaceProductMediaById('prod_1', [
      {
        id: 'media_002',
        url: 'https://cdn.example.com/products/amani-chair/side.jpg',
        alt: 'Amani Chair side view',
        sortOrder: 1,
        isPrimary: false,
        kind: 'image',
      },
      {
        id: 'media_001',
        url: 'https://cdn.example.com/products/amani-chair/main.jpg',
        alt: 'Amani Chair front view',
        sortOrder: 0,
        isPrimary: true,
        kind: 'image',
      },
    ]);

    expect(prismaMock.product.update).toHaveBeenCalledWith({
      where: { id: 'prod_1' },
      data: {
        images: {
          deleteMany: {},
          create: [
            {
              id: 'media_001',
              url: 'https://cdn.example.com/products/amani-chair/main.jpg',
              alt: 'Amani Chair front view',
              isPrimary: true,
              kind: 'image',
              position: 0,
            },
            {
              id: 'media_002',
              url: 'https://cdn.example.com/products/amani-chair/side.jpg',
              alt: 'Amani Chair side view',
              isPrimary: false,
              kind: 'image',
              position: 1,
            },
          ],
        },
      },
      include: {
        images: {
          orderBy: { position: 'asc' },
        },
      },
    });
  });

  test.each([
    ['createAdminProduct', 'create', [{ name: 'Amani Chair', slug: 'amani-chair' }], 'createAdminProduct', Object.assign(new Error('unique fail'), { code: 'P2002' }), new Error('mapped unique')],
    ['updateAdminProductById', 'update', ['prod_1', { name: 'Updated' }], 'updateAdminProductById', Object.assign(new Error('not found'), { code: 'P2025' }), new Error('mapped not found')],
    ['publishProductById', 'update', ['prod_1'], 'publishProductById', new Error('publish fail'), new Error('mapped publish')],
    ['unpublishProductById', 'update', ['prod_1'], 'unpublishProductById', new Error('unpublish fail'), new Error('mapped unpublish')],
    ['replaceProductMediaById', 'update', ['prod_1', []], 'replaceProductMediaById', new Error('db exploded'), new Error('mapped generic')],
  ])('%s propagates normalized failures', async (method, op, args, operation, dbError, mappedError) => {
    const { productRepository, prismaMock, normalizeDbError } = await loadProductRepository({
      normalizeImpl: () => {
        throw mappedError;
      },
    });
    prismaMock.product[op].mockRejectedValueOnce(dbError);

    await expect(productRepository[method](...args)).rejects.toThrow(mappedError);
    expect(normalizeDbError).toHaveBeenCalledWith(dbError, { repository: 'product', operation });
  });
});
