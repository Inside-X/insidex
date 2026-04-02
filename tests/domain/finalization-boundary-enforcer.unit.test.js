import { jest } from '@jest/globals';
import { enforceFinalizationBoundary } from '../../src/domain/finalization-boundary-enforcer.js';

describe('enforceFinalizationBoundary', () => {
  test('success is allowed only when upstream coordination/classification safely permit it', async () => {
    await expect(enforceFinalizationBoundary(
      {
        decrementAttemptCoordination: {
          canAttempt: true,
          resolvedTarget: { kind: 'product', productId: 'prod_1', variantId: null, sku: null },
          blockingReasonCodes: [],
        },
        handlingClassification: {
          classification: 'safe_replay',
          authoritativeOutcome: { outcomeKind: 'decrement_confirmed' },
          blockingReasonCodes: [],
        },
      },
    )).resolves.toEqual({
      mayFinalizeAsSuccess: true,
      boundaryDecision: 'allow_success',
      blockingReasonCodes: [],
    });
  });

  test('target-resolution failure blocks success', async () => {
    await expect(enforceFinalizationBoundary(
      {
        decrementAttemptCoordination: {
          canAttempt: false,
          resolvedTarget: null,
          blockingReasonCodes: ['stock_target_unresolved'],
        },
        handlingClassification: {
          classification: 'safe_replay',
          authoritativeOutcome: null,
          blockingReasonCodes: [],
        },
      },
    )).resolves.toEqual({
      mayFinalizeAsSuccess: false,
      boundaryDecision: 'block_success',
      blockingReasonCodes: [
        'finalization_boundary_stock_unresolved',
        'finalization_boundary_attempt_blocked',
        'finalization_boundary_uncertain',
        'stock_target_unresolved',
      ],
    });
  });

  test('decrement-attempt blocked state blocks success', async () => {
    await expect(enforceFinalizationBoundary(
      {
        decrementAttemptCoordination: {
          canAttempt: false,
          resolvedTarget: { kind: 'product', productId: 'prod_1', variantId: null, sku: null },
          blockingReasonCodes: ['stock_truth_unavailable'],
        },
        handlingClassification: {
          classification: 'safe_replay',
          authoritativeOutcome: null,
          blockingReasonCodes: [],
        },
      },
    )).resolves.toEqual({
      mayFinalizeAsSuccess: false,
      boundaryDecision: 'block_success',
      blockingReasonCodes: [
        'finalization_boundary_attempt_blocked',
        'finalization_boundary_uncertain',
        'stock_truth_unavailable',
      ],
    });
  });

  test('unclassifiable repeated handling blocks success', async () => {
    await expect(enforceFinalizationBoundary(
      {
        decrementAttemptCoordination: {
          canAttempt: true,
          resolvedTarget: { kind: 'product', productId: 'prod_1', variantId: null, sku: null },
          blockingReasonCodes: [],
        },
        handlingClassification: {
          classification: 'unclassifiable',
          authoritativeOutcome: null,
          blockingReasonCodes: ['duplicate_vs_new_uncertain'],
        },
      },
    )).resolves.toEqual({
      mayFinalizeAsSuccess: false,
      boundaryDecision: 'block_success',
      blockingReasonCodes: [
        'finalization_boundary_classification_unclassifiable',
        'finalization_boundary_uncertain',
        'duplicate_vs_new_uncertain',
      ],
    });
  });

  test('authoritative prior outcome conflict blocks success', async () => {
    await expect(enforceFinalizationBoundary(
      {
        decrementAttemptCoordination: {
          canAttempt: true,
          resolvedTarget: { kind: 'product', productId: 'prod_1', variantId: null, sku: null },
          blockingReasonCodes: [],
        },
        handlingClassification: {
          classification: 'authoritative_prior_outcome',
          authoritativeOutcome: { outcomeKind: 'decrement_failed' },
          blockingReasonCodes: [],
        },
      },
    )).resolves.toEqual({
      mayFinalizeAsSuccess: false,
      boundaryDecision: 'block_success',
      blockingReasonCodes: [
        'finalization_boundary_authoritative_outcome_conflict',
        'finalization_boundary_uncertain',
      ],
    });
  });

  test('contradictory success signals block success', async () => {
    await expect(enforceFinalizationBoundary(
      {
        orderSuccessRequested: true,
        paymentSuccessRequested: true,
        decrementAttemptCoordination: {
          canAttempt: false,
          resolvedTarget: null,
          blockingReasonCodes: ['stock_target_unresolved'],
        },
        handlingClassification: {
          classification: 'unclassifiable',
          authoritativeOutcome: null,
          blockingReasonCodes: ['replay_safety_unknown'],
        },
      },
    )).resolves.toEqual({
      mayFinalizeAsSuccess: false,
      boundaryDecision: 'block_success',
      blockingReasonCodes: [
        'finalization_boundary_stock_unresolved',
        'finalization_boundary_attempt_blocked',
        'finalization_boundary_classification_unclassifiable',
        'finalization_boundary_contradictory_success_signal',
        'finalization_boundary_uncertain',
        'replay_safety_unknown',
        'stock_target_unresolved',
      ],
    });
  });

  test('truth divergence blocks success', async () => {
    await expect(enforceFinalizationBoundary(
      {
        decrementAttemptCoordination: {
          canAttempt: true,
          resolvedTarget: { kind: 'product', productId: 'prod_1', variantId: null, sku: null },
          blockingReasonCodes: [],
        },
        handlingClassification: {
          classification: 'safe_replay',
          authoritativeOutcome: { outcomeKind: 'decrement_confirmed' },
          blockingReasonCodes: ['prior_outcome_unreconcilable', 'repeated_handling_truth_divergence'],
        },
      },
    )).resolves.toEqual({
      mayFinalizeAsSuccess: false,
      boundaryDecision: 'block_success',
      blockingReasonCodes: [
        'finalization_boundary_truth_divergence',
        'finalization_boundary_uncertain',
        'prior_outcome_unreconcilable',
        'repeated_handling_truth_divergence',
      ],
    });
  });

  test('uncertain boundary state blocks by default when dependencies return unresolved states', async () => {
    const coordinateDecrementAttempt = jest.fn(async () => ({
      canAttempt: false,
      resolvedTarget: null,
      blockingReasonCodes: ['stock_target_unresolved'],
    }));

    const classifyDecrementHandlingAttempt = jest.fn(async () => ({
      classification: 'unclassifiable',
      authoritativeOutcome: null,
      blockingReasonCodes: ['duplicate_vs_new_uncertain'],
    }));

    await expect(enforceFinalizationBoundary(
      {
        attemptInput: { productName: 'Chair' },
        priorContext: { priorAttemptExists: true },
      },
      { coordinateDecrementAttempt, classifyDecrementHandlingAttempt },
    )).resolves.toEqual({
      mayFinalizeAsSuccess: false,
      boundaryDecision: 'block_success',
      blockingReasonCodes: [
        'finalization_boundary_stock_unresolved',
        'finalization_boundary_attempt_blocked',
        'finalization_boundary_classification_unclassifiable',
        'finalization_boundary_uncertain',
        'duplicate_vs_new_uncertain',
        'stock_target_unresolved',
      ],
    });

    expect(coordinateDecrementAttempt).toHaveBeenCalledTimes(1);
    expect(classifyDecrementHandlingAttempt).toHaveBeenCalledTimes(1);
  });

  test('reason ordering is deterministic and deduplicated', async () => {
    const result = await enforceFinalizationBoundary(
      {
        businessSuccessRequested: true,
        decrementAttemptCoordination: {
          canAttempt: false,
          resolvedTarget: null,
          blockingReasonCodes: ['stock_target_unresolved', 'stock_target_unresolved'],
        },
        handlingClassification: {
          classification: 'unclassifiable',
          authoritativeOutcome: { outcomeKind: 'decrement_blocked' },
          blockingReasonCodes: ['prior_outcome_unreconcilable', 'repeated_handling_truth_divergence'],
        },
      },
    );

    expect(result).toEqual({
      mayFinalizeAsSuccess: false,
      boundaryDecision: 'block_success',
      blockingReasonCodes: [
        'finalization_boundary_stock_unresolved',
        'finalization_boundary_attempt_blocked',
        'finalization_boundary_classification_unclassifiable',
        'finalization_boundary_truth_divergence',
        'finalization_boundary_authoritative_outcome_conflict',
        'finalization_boundary_contradictory_success_signal',
        'finalization_boundary_uncertain',
        'prior_outcome_unreconcilable',
        'repeated_handling_truth_divergence',
        'stock_target_unresolved',
      ],
    });
    expect(new Set(result.blockingReasonCodes).size).toBe(result.blockingReasonCodes.length);
  });

  test('no side effects / no writes and no remediation-refund-provider leakage', async () => {
    const deps = {
      coordinateDecrementAttempt: jest.fn(async () => ({
        canAttempt: true,
        resolvedTarget: { kind: 'product', productId: 'prod_1', variantId: null, sku: null },
        blockingReasonCodes: [],
      })),
      classifyDecrementHandlingAttempt: jest.fn(async () => ({
        classification: 'safe_replay',
        authoritativeOutcome: { outcomeKind: 'decrement_confirmed' },
        blockingReasonCodes: [],
      })),
      save: jest.fn(),
      update: jest.fn(),
      write: jest.fn(),
      refund: jest.fn(),
      remediate: jest.fn(),
      providerRecover: jest.fn(),
    };

    const result = await enforceFinalizationBoundary(
      {
        attemptInput: { productId: 'prod_1', intendedFinalizationKey: 'intent_1' },
        priorContext: { intendedFinalizationKey: 'intent_1' },
      },
      deps,
    );

    expect(result).toEqual({
      mayFinalizeAsSuccess: true,
      boundaryDecision: 'allow_success',
      blockingReasonCodes: [],
    });

    expect(deps.coordinateDecrementAttempt).toHaveBeenCalledTimes(1);
    expect(deps.classifyDecrementHandlingAttempt).toHaveBeenCalledTimes(1);
    expect(deps.save).not.toHaveBeenCalled();
    expect(deps.update).not.toHaveBeenCalled();
    expect(deps.write).not.toHaveBeenCalled();
    expect(deps.refund).not.toHaveBeenCalled();
    expect(deps.remediate).not.toHaveBeenCalled();
    expect(deps.providerRecover).not.toHaveBeenCalled();

    expect(Object.keys(result).sort()).toEqual(['blockingReasonCodes', 'boundaryDecision', 'mayFinalizeAsSuccess']);
    expect(result).not.toHaveProperty('remediationAction');
    expect(result).not.toHaveProperty('refundDecision');
    expect(result).not.toHaveProperty('providerRecoveryAction');
  });
});
