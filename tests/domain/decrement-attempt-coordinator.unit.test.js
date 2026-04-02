import { jest } from '@jest/globals';
import { coordinateDecrementAttempt } from '../../src/domain/decrement-attempt-coordinator.js';

describe('coordinateDecrementAttempt', () => {
  test('resolved product target + verifiable available stock truth -> canAttempt true', async () => {
    await expect(coordinateDecrementAttempt({
      productId: 'prod_1',
      stockTruth: { isVerifiable: true, isAvailable: true },
    })).resolves.toEqual({
      canAttempt: true,
      resolvedTarget: {
        kind: 'product',
        productId: 'prod_1',
        variantId: null,
        sku: null,
      },
      blockingReasonCodes: [],
    });
  });

  test('resolved variant target + verifiable available stock truth -> canAttempt true', async () => {
    await expect(coordinateDecrementAttempt({
      productId: 'prod_1',
      variantId: 'var_1',
      stockTruth: { isVerifiable: true, isAvailable: true },
    })).resolves.toEqual({
      canAttempt: true,
      resolvedTarget: {
        kind: 'variant',
        productId: 'prod_1',
        variantId: 'var_1',
        sku: null,
      },
      blockingReasonCodes: [],
    });
  });

  test('unresolved target from R1 blocks', async () => {
    const resolveStockBearingTarget = jest.fn(async () => ({
      isResolved: false,
      target: null,
      blockingReasonCodes: ['stock_target_unresolved'],
    }));

    await expect(coordinateDecrementAttempt(
      { stockTruth: { isVerifiable: true, isAvailable: true } },
      { resolveStockBearingTarget },
    )).resolves.toEqual({
      canAttempt: false,
      resolvedTarget: null,
      blockingReasonCodes: ['stock_target_unresolved', 'decrement_attempt_coordination_uncertain'],
    });
  });

  test('ambiguous/conflicting target assumptions block', async () => {
    await expect(coordinateDecrementAttempt({
      productId: 'prod_1',
      variantId: 'var_1',
      resolvedTarget: { kind: 'variant', productId: 'prod_1', variantId: 'var_2', sku: null },
      stockTruth: { isVerifiable: true, isAvailable: true },
    })).resolves.toEqual({
      canAttempt: false,
      resolvedTarget: null,
      blockingReasonCodes: ['decrement_attempt_target_conflict', 'decrement_attempt_coordination_uncertain'],
    });
  });

  test('unavailable stock truth blocks', async () => {
    await expect(coordinateDecrementAttempt({
      productId: 'prod_1',
      stockTruth: { isVerifiable: true, isAvailable: false },
    })).resolves.toEqual({
      canAttempt: false,
      resolvedTarget: null,
      blockingReasonCodes: ['stock_truth_unavailable', 'decrement_attempt_coordination_uncertain'],
    });
  });

  test('unverifiable stock truth blocks', async () => {
    await expect(coordinateDecrementAttempt({
      productId: 'prod_1',
      stockTruth: { isVerifiable: false, isAvailable: true },
    })).resolves.toEqual({
      canAttempt: false,
      resolvedTarget: null,
      blockingReasonCodes: ['stock_truth_unverifiable', 'decrement_attempt_coordination_uncertain'],
    });
  });

  test('weak/fuzzy identity signals are rejected', async () => {
    await expect(coordinateDecrementAttempt({
      productName: 'Chair',
      displayLabel: 'Blue chair',
      stockTruth: { isVerifiable: true, isAvailable: true },
    })).resolves.toEqual({
      canAttempt: false,
      resolvedTarget: null,
      blockingReasonCodes: [
        'weak_identity_signal_only',
        'stock_target_unresolved',
        'decrement_attempt_coordination_uncertain',
      ],
    });
  });

  test('reason-code ordering is deterministic and deduplicated', async () => {
    const result = await coordinateDecrementAttempt({
      productName: 'hint',
      stockTruth: { isVerifiable: false, isAvailable: false },
    });

    expect(result).toEqual({
      canAttempt: false,
      resolvedTarget: null,
      blockingReasonCodes: [
        'weak_identity_signal_only',
        'stock_target_unresolved',
        'stock_truth_unverifiable',
        'decrement_attempt_coordination_uncertain',
      ],
    });
    expect(new Set(result.blockingReasonCodes).size).toBe(result.blockingReasonCodes.length);
  });

  test('no side effects / no writes', async () => {
    const deps = {
      resolveStockBearingTarget: jest.fn(async () => ({
        isResolved: true,
        target: { kind: 'variant', productId: 'prod_1', variantId: 'var_1', sku: 'SKU-1' },
        blockingReasonCodes: [],
      })),
      save: jest.fn(),
      update: jest.fn(),
      write: jest.fn(),
    };

    await coordinateDecrementAttempt(
      { productId: 'prod_1', variantId: 'var_1', sku: 'SKU-1', stockTruth: { isVerifiable: true, isAvailable: true } },
      deps,
    );

    expect(deps.resolveStockBearingTarget).toHaveBeenCalledTimes(1);
    expect(deps.save).not.toHaveBeenCalled();
    expect(deps.update).not.toHaveBeenCalled();
    expect(deps.write).not.toHaveBeenCalled();
  });

  test('no leakage into replay/idempotency/finalization semantics in return shape', async () => {
    const result = await coordinateDecrementAttempt({
      productId: 'prod_1',
      stockTruth: { isVerifiable: true, isAvailable: true },
    });

    expect(Object.keys(result).sort()).toEqual(['blockingReasonCodes', 'canAttempt', 'resolvedTarget']);
    expect(result).not.toHaveProperty('isReplay');
    expect(result).not.toHaveProperty('isDuplicate');
    expect(result).not.toHaveProperty('isFinalized');
  });
});
