import { jest } from '@jest/globals';
import { classifyDecrementHandlingAttempt } from '../../src/domain/decrement-handling-attempt-classifier.js';

describe('classifyDecrementHandlingAttempt', () => {
  test('authoritative prior outcome classification when same intent is established and request identity is absent', async () => {
    await expect(classifyDecrementHandlingAttempt(
      {
        productId: 'prod_1',
        variantId: 'var_1',
        intendedFinalizationKey: 'intent_1',
      },
      {
        hasAuthoritativeOutcome: true,
        intendedFinalizationKey: 'intent_1',
        authoritativeOutcome: {
          outcomeKind: 'decrement_confirmed',
          target: { kind: 'variant', productId: 'prod_1', variantId: 'var_1', sku: null },
        },
      },
    )).resolves.toEqual({
      classification: 'authoritative_prior_outcome',
      authoritativeOutcome: {
        outcomeKind: 'decrement_confirmed',
        target: { kind: 'variant', productId: 'prod_1', variantId: 'var_1', sku: null },
      },
      blockingReasonCodes: [],
    });
  });

  test('safe replay classification for same intended finalization with consistent target continuity', async () => {
    await expect(classifyDecrementHandlingAttempt(
      {
        productId: 'prod_1',
        variantId: 'var_1',
        intendedFinalizationKey: 'intent_1',
        requestKey: 'req_2',
      },
      {
        intendedFinalizationKey: 'intent_1',
        requestKey: 'req_1',
        authoritativeOutcome: {
          outcomeKind: 'decrement_confirmed',
          target: { kind: 'variant', productId: 'prod_1', variantId: 'var_1', sku: null },
        },
      },
    )).resolves.toEqual({
      classification: 'safe_replay',
      authoritativeOutcome: {
        outcomeKind: 'decrement_confirmed',
        target: { kind: 'variant', productId: 'prod_1', variantId: 'var_1', sku: null },
      },
      blockingReasonCodes: [],
    });
  });

  test('duplicate request classification for same intended finalization and same request key', async () => {
    await expect(classifyDecrementHandlingAttempt(
      {
        productId: 'prod_1',
        intendedFinalizationKey: 'intent_1',
        requestKey: 'req_1',
      },
      {
        intendedFinalizationKey: 'intent_1',
        requestKey: 'req_1',
        authoritativeOutcome: {
          outcomeKind: 'decrement_confirmed',
          target: { kind: 'product', productId: 'prod_1', variantId: null, sku: null },
        },
      },
    )).resolves.toEqual({
      classification: 'duplicate_request',
      authoritativeOutcome: {
        outcomeKind: 'decrement_confirmed',
        target: { kind: 'product', productId: 'prod_1', variantId: null, sku: null },
      },
      blockingReasonCodes: [],
    });
  });

  test('new intended finalization classification when intent differs and no ambiguity exists', async () => {
    await expect(classifyDecrementHandlingAttempt(
      {
        productId: 'prod_1',
        intendedFinalizationKey: 'intent_new',
      },
      {
        intendedFinalizationKey: 'intent_old',
        authoritativeOutcome: {
          outcomeKind: 'decrement_confirmed',
          target: { kind: 'product', productId: 'prod_1', variantId: null, sku: null },
        },
      },
    )).resolves.toEqual({
      classification: 'new_intended_finalization',
      authoritativeOutcome: null,
      blockingReasonCodes: [],
    });
  });

  test('new intended finalization when no prior authoritative outcome exists and intent key is present', async () => {
    await expect(classifyDecrementHandlingAttempt(
      {
        productId: 'prod_1',
        intendedFinalizationKey: 'intent_1',
      },
      {},
    )).resolves.toEqual({
      classification: 'new_intended_finalization',
      authoritativeOutcome: null,
      blockingReasonCodes: [],
    });
  });

  test('unclassifiable when prior authoritative outcome is unknown', async () => {
    await expect(classifyDecrementHandlingAttempt(
      {
        productId: 'prod_1',
        intendedFinalizationKey: 'intent_1',
      },
      {
        hasAuthoritativeOutcome: true,
        intendedFinalizationKey: 'intent_1',
        authoritativeOutcome: null,
      },
    )).resolves.toEqual({
      classification: 'unclassifiable',
      authoritativeOutcome: null,
      blockingReasonCodes: [
        'authoritative_outcome_unknown',
        'decrement_handling_classification_uncertain',
      ],
    });
  });

  test('invalid authoritative target shape fails closed as unknown authority', async () => {
    await expect(classifyDecrementHandlingAttempt(
      {
        productId: 'prod_1',
        intendedFinalizationKey: 'intent_1',
      },
      {
        hasAuthoritativeOutcome: true,
        intendedFinalizationKey: 'intent_1',
        authoritativeOutcome: {
          outcomeKind: 'decrement_confirmed',
          target: { kind: 'unexpected_kind', productId: 'prod_1' },
        },
      },
    )).resolves.toEqual({
      classification: 'unclassifiable',
      authoritativeOutcome: null,
      blockingReasonCodes: [
        'authoritative_outcome_unknown',
        'decrement_handling_classification_uncertain',
      ],
    });
  });

  test('authoritative target continuity unresolved fails closed', async () => {
    await expect(classifyDecrementHandlingAttempt(
      {
        intendedFinalizationKey: 'intent_1',
      },
      {
        intendedFinalizationKey: 'intent_1',
        authoritativeOutcome: {
          outcomeKind: 'decrement_confirmed',
          target: { kind: 'product', productId: 'prod_1', variantId: null, sku: null },
        },
      },
      {
        resolveStockBearingTarget: jest.fn(async () => ({
          isResolved: false,
          target: null,
          blockingReasonCodes: ['stock_target_unresolved'],
        })),
      },
    )).resolves.toEqual({
      classification: 'unclassifiable',
      authoritativeOutcome: null,
      blockingReasonCodes: [
        'stock_target_continuity_unresolved',
        'stock_target_unresolved',
        'decrement_handling_classification_uncertain',
      ],
    });
  });

  test('authoritative target mismatch fails closed with unreconcilable divergence', async () => {
    await expect(classifyDecrementHandlingAttempt(
      {
        productId: 'prod_2',
        intendedFinalizationKey: 'intent_1',
      },
      {
        intendedFinalizationKey: 'intent_1',
        authoritativeOutcome: {
          outcomeKind: 'decrement_confirmed',
          target: { kind: 'product', productId: 'prod_1', variantId: null, sku: null },
        },
      },
    )).resolves.toEqual({
      classification: 'unclassifiable',
      authoritativeOutcome: null,
      blockingReasonCodes: [
        'prior_outcome_unreconcilable',
        'repeated_handling_truth_divergence',
        'decrement_handling_classification_uncertain',
      ],
    });
  });

  test('intent mismatch with pre-existing uncertainty fails closed (no unsafe new-intent classification)', async () => {
    await expect(classifyDecrementHandlingAttempt(
      {
        productId: 'prod_2',
        intendedFinalizationKey: 'intent_new',
      },
      {
        intendedFinalizationKey: 'intent_old',
        authoritativeOutcome: {
          outcomeKind: 'decrement_confirmed',
          target: { kind: 'product', productId: 'prod_1', variantId: null, sku: null },
        },
      },
    )).resolves.toEqual({
      classification: 'unclassifiable',
      authoritativeOutcome: null,
      blockingReasonCodes: [
        'prior_outcome_unreconcilable',
        'repeated_handling_truth_divergence',
        'decrement_handling_classification_uncertain',
      ],
    });
  });

  test('partial identifier overlap alone is rejected', async () => {
    await expect(classifyDecrementHandlingAttempt(
      {
        productId: 'prod_1',
        externalReference: 'ext_1',
      },
      {
        priorAttemptExists: true,
        externalReference: 'ext_1',
      },
    )).resolves.toEqual({
      classification: 'unclassifiable',
      authoritativeOutcome: null,
      blockingReasonCodes: [
        'authoritative_outcome_unknown',
        'duplicate_vs_new_uncertain',
        'weak_same_intent_signal_only',
        'decrement_handling_classification_uncertain',
      ],
    });
  });

  test('superficial payload similarity alone is rejected', async () => {
    await expect(classifyDecrementHandlingAttempt(
      {
        productId: 'prod_1',
        payloadFingerprint: 'payload-like-match',
      },
      {
        priorAttemptExists: true,
      },
    )).resolves.toEqual({
      classification: 'unclassifiable',
      authoritativeOutcome: null,
      blockingReasonCodes: [
        'authoritative_outcome_unknown',
        'duplicate_vs_new_uncertain',
        'weak_same_intent_signal_only',
        'decrement_handling_classification_uncertain',
      ],
    });
  });

  test('client-declared sameness alone is rejected', async () => {
    await expect(classifyDecrementHandlingAttempt(
      {
        clientDeclaredSameIntent: true,
      },
      {
        priorAttemptExists: true,
      },
    )).resolves.toEqual({
      classification: 'unclassifiable',
      authoritativeOutcome: null,
      blockingReasonCodes: [
        'authoritative_outcome_unknown',
        'duplicate_vs_new_uncertain',
        'weak_same_intent_signal_only',
        'stock_target_continuity_unresolved',
        'stock_target_unresolved',
        'decrement_handling_classification_uncertain',
      ],
    });
  });

  test('SKU/product text reuse alone is rejected', async () => {
    await expect(classifyDecrementHandlingAttempt(
      {
        productName: 'Chair',
        sku: 'SKU-1',
      },
      {
        priorAttemptExists: true,
      },
      {
        resolveStockBearingTarget: jest.fn(async () => ({
          isResolved: false,
          target: null,
          blockingReasonCodes: ['sku_unresolved', 'stock_target_unresolved'],
        })),
      },
    )).resolves.toEqual({
      classification: 'unclassifiable',
      authoritativeOutcome: null,
      blockingReasonCodes: [
        'authoritative_outcome_unknown',
        'duplicate_vs_new_uncertain',
        'weak_same_intent_signal_only',
        'stock_target_continuity_unresolved',
        'stock_target_unresolved',
        'decrement_handling_classification_uncertain',
        'sku_unresolved',
      ],
    });
  });

  test('deterministic classification and reason ordering', async () => {
    const result = await classifyDecrementHandlingAttempt(
      {
        clientDeclaredSameIntent: true,
      },
      {
        hasAuthoritativeOutcome: true,
      },
    );

    expect(result).toEqual({
      classification: 'unclassifiable',
      authoritativeOutcome: null,
      blockingReasonCodes: [
        'authoritative_outcome_unknown',
        'replay_safety_unknown',
        'duplicate_vs_new_uncertain',
        'identity_continuity_unresolved',
        'weak_same_intent_signal_only',
        'stock_target_continuity_unresolved',
        'stock_target_unresolved',
        'decrement_handling_classification_uncertain',
      ],
    });
    expect(new Set(result.blockingReasonCodes).size).toBe(result.blockingReasonCodes.length);
  });

  test('no side effects / no writes', async () => {
    const deps = {
      resolveStockBearingTarget: jest.fn(async () => ({
        isResolved: true,
        target: { kind: 'variant', productId: 'prod_1', variantId: 'var_1', sku: null },
        blockingReasonCodes: [],
      })),
      save: jest.fn(),
      update: jest.fn(),
      write: jest.fn(),
    };

    await classifyDecrementHandlingAttempt(
      {
        productId: 'prod_1',
        variantId: 'var_1',
        intendedFinalizationKey: 'intent_1',
      },
      {
        intendedFinalizationKey: 'intent_1',
        authoritativeOutcome: {
          outcomeKind: 'decrement_confirmed',
          target: { kind: 'variant', productId: 'prod_1', variantId: 'var_1', sku: null },
        },
      },
      deps,
    );

    expect(deps.resolveStockBearingTarget).toHaveBeenCalledTimes(1);
    expect(deps.save).not.toHaveBeenCalled();
    expect(deps.update).not.toHaveBeenCalled();
    expect(deps.write).not.toHaveBeenCalled();
  });

  test('no leakage into broader finalization/remediation semantics in return shape', async () => {
    const result = await classifyDecrementHandlingAttempt(
      {
        productId: 'prod_1',
        intendedFinalizationKey: 'intent_1',
      },
      {
        intendedFinalizationKey: 'intent_1',
        authoritativeOutcome: {
          outcomeKind: 'decrement_confirmed',
          target: { kind: 'product', productId: 'prod_1', variantId: null, sku: null },
        },
      },
    );

    expect(Object.keys(result).sort()).toEqual(['authoritativeOutcome', 'blockingReasonCodes', 'classification']);
    expect(result).not.toHaveProperty('isFinalized');
    expect(result).not.toHaveProperty('remediationAction');
    expect(result).not.toHaveProperty('refundDecision');
  });
});