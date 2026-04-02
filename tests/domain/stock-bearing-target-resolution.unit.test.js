import { jest } from '@jest/globals';
import { resolveStockBearingTarget } from '../../src/domain/stock-bearing-target-resolution.js';

describe('resolveStockBearingTarget', () => {
  test('resolves product-only sellable identity to product target', async () => {
    await expect(resolveStockBearingTarget({ productId: 'prod_1' })).resolves.toEqual({
      isResolved: true,
      target: {
        kind: 'product',
        productId: 'prod_1',
        variantId: null,
        sku: null,
      },
      blockingReasonCodes: [],
    });
  });

  test('resolves variant-based sellable identity to variant target', async () => {
    await expect(resolveStockBearingTarget({ productId: 'prod_1', variantId: 'var_1' })).resolves.toEqual({
      isResolved: true,
      target: {
        kind: 'variant',
        productId: 'prod_1',
        variantId: 'var_1',
        sku: null,
      },
      blockingReasonCodes: [],
    });
  });

  test('sku resolves only through mapped variant identity', async () => {
    const resolveVariantBySku = jest.fn(() => ({ productId: 'prod_1', variantId: 'var_1' }));

    await expect(resolveStockBearingTarget(
      { productId: 'prod_1', variantId: 'var_1', sku: 'SKU-1' },
      { resolveVariantBySku },
    )).resolves.toEqual({
      isResolved: true,
      target: {
        kind: 'variant',
        productId: 'prod_1',
        variantId: 'var_1',
        sku: 'SKU-1',
      },
      blockingReasonCodes: [],
    });

    expect(resolveVariantBySku).toHaveBeenCalledWith('SKU-1');
  });

  test('sku never creates second independent stock-bearing target', async () => {
    const result = await resolveStockBearingTarget(
      { productId: 'prod_1', variantId: 'var_1', sku: 'SKU-1' },
      { resolveVariantBySku: () => ({ productId: 'prod_1', variantId: 'var_1' }) },
    );

    expect(result.isResolved).toBe(true);
    expect(result.target.kind).toBe('variant');
    expect(result.target.productId).toBe('prod_1');
    expect(result.target.variantId).toBe('var_1');
    expect(Object.keys(result.target).sort()).toEqual(['kind', 'productId', 'sku', 'variantId']);
  });

  test('product/variant mismatch fails closed', async () => {
    await expect(resolveStockBearingTarget(
      { productId: 'prod_a', variantId: 'var_1', sku: 'SKU-1' },
      { resolveVariantBySku: () => ({ productId: 'prod_b', variantId: 'var_1' }) },
    )).resolves.toEqual({
      isResolved: false,
      target: null,
      blockingReasonCodes: ['product_variant_conflict', 'stock_target_unresolved'],
    });
  });

  test('sku unresolved fails closed', async () => {
    await expect(resolveStockBearingTarget(
      { productId: 'prod_1', sku: 'SKU-MISSING' },
      { resolveVariantBySku: () => null },
    )).resolves.toEqual({
      isResolved: false,
      target: null,
      blockingReasonCodes: ['sku_unresolved', 'stock_target_unresolved'],
    });
  });

  test('sku/variant mismatch fails closed', async () => {
    await expect(resolveStockBearingTarget(
      { productId: 'prod_1', variantId: 'var_a', sku: 'SKU-1' },
      { resolveVariantBySku: () => ({ productId: 'prod_1', variantId: 'var_b' }) },
    )).resolves.toEqual({
      isResolved: false,
      target: null,
      blockingReasonCodes: ['sku_variant_mismatch', 'stock_target_unresolved'],
    });
  });

  test('weak/fuzzy identity signals are rejected', async () => {
    await expect(resolveStockBearingTarget({ productName: 'Chair', variantLabel: 'Blue' })).resolves.toEqual({
      isResolved: false,
      target: null,
      blockingReasonCodes: ['weak_identity_signal_only', 'stock_target_unresolved'],
    });
  });

  test('multiple candidate targets fail closed', async () => {
    await expect(resolveStockBearingTarget(
      { sku: 'SKU-1' },
      { resolveVariantBySku: () => ([{ productId: 'p1', variantId: 'v1' }, { productId: 'p2', variantId: 'v2' }]) },
    )).resolves.toEqual({
      isResolved: false,
      target: null,
      blockingReasonCodes: ['multiple_stock_targets', 'stock_target_ambiguous', 'stock_target_unresolved'],
    });
  });

  test('reason-code order is deterministic and deduplicated', async () => {
    const result = await resolveStockBearingTarget(
      { productName: 'hint', sku: 'SKU-1' },
      { resolveVariantBySku: () => [{ productId: 'p1', variantId: 'v1' }, { productId: 'p2', variantId: 'v2' }] },
    );

    expect(result).toEqual({
      isResolved: false,
      target: null,
      blockingReasonCodes: [
        'multiple_stock_targets',
        'stock_target_ambiguous',
        'weak_identity_signal_only',
        'stock_target_unresolved',
      ],
    });
    expect(new Set(result.blockingReasonCodes).size).toBe(result.blockingReasonCodes.length);
  });

  test('no side effects: resolver is read-only and writes nothing', async () => {
    const deps = {
      resolveVariantBySku: jest.fn(() => ({ productId: 'prod_1', variantId: 'var_1' })),
      save: jest.fn(),
      update: jest.fn(),
      write: jest.fn(),
    };

    await resolveStockBearingTarget({ productId: 'prod_1', variantId: 'var_1', sku: 'SKU-1' }, deps);

    expect(deps.resolveVariantBySku).toHaveBeenCalledTimes(1);
    expect(deps.save).not.toHaveBeenCalled();
    expect(deps.update).not.toHaveBeenCalled();
    expect(deps.write).not.toHaveBeenCalled();
  });
});
