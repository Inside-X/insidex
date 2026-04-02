import { jest } from '@jest/globals';
import { signalReconciliationRemediationBoundary } from '../../src/domain/reconciliation-remediation-boundary-signaler.js';

describe('signalReconciliationRemediationBoundary', () => {
  test('ordinary blocked/non-success can remain normal when explicitly marked as ordinary', async () => {
    await expect(signalReconciliationRemediationBoundary({
      treatBlockedAsOrdinaryNonSuccess: true,
      finalizationBoundary: {
        mayFinalizeAsSuccess: false,
        boundaryDecision: 'block_success',
        blockingReasonCodes: ['finalization_boundary_attempt_blocked'],
      },
    })).resolves.toEqual({
      isInRemediationBoundary: false,
      boundaryStatus: 'normal_non_success',
      signalingReasonCodes: [],
    });
  });

  test('non-converged case must signal reconciliation/remediation boundary', async () => {
    await expect(signalReconciliationRemediationBoundary({
      nonConvergedState: true,
      finalizationBoundary: {
        mayFinalizeAsSuccess: false,
        boundaryDecision: 'block_success',
        blockingReasonCodes: ['finalization_boundary_attempt_blocked'],
      },
    })).resolves.toEqual({
      isInRemediationBoundary: true,
      boundaryStatus: 'reconciliation_remediation_boundary',
      signalingReasonCodes: [
        'remediation_boundary_nonconverged_state',
        'remediation_boundary_finalization_blocked_nonconverged',
      ],
    });
  });

  test('unresolved authoritative outcome reconciliation signals remediation boundary', async () => {
    await expect(signalReconciliationRemediationBoundary({
      finalizationBoundary: {
        mayFinalizeAsSuccess: false,
        boundaryDecision: 'block_success',
        blockingReasonCodes: ['authoritative_outcome_unknown'],
      },
    })).resolves.toEqual({
      isInRemediationBoundary: true,
      boundaryStatus: 'reconciliation_remediation_boundary',
      signalingReasonCodes: [
        'remediation_boundary_authoritative_outcome_unreconciled',
        'remediation_boundary_finalization_blocked_nonconverged',
      ],
    });
  });

  test('divergent repeated handling truth signals remediation boundary', async () => {
    await expect(signalReconciliationRemediationBoundary({
      finalizationBoundary: {
        mayFinalizeAsSuccess: false,
        boundaryDecision: 'block_success',
        blockingReasonCodes: ['repeated_handling_truth_divergence'],
      },
    })).resolves.toEqual({
      isInRemediationBoundary: true,
      boundaryStatus: 'reconciliation_remediation_boundary',
      signalingReasonCodes: [
        'remediation_boundary_finalization_blocked_nonconverged',
        'remediation_boundary_divergent_repeated_handling',
      ],
    });
  });

  test('finalization boundary blocked + non-converged state signals remediation boundary', async () => {
    await expect(signalReconciliationRemediationBoundary({
      nonConvergedState: true,
      finalizationBoundary: {
        mayFinalizeAsSuccess: false,
        boundaryDecision: 'block_success',
        blockingReasonCodes: ['finalization_boundary_stock_unresolved'],
      },
    })).resolves.toEqual({
      isInRemediationBoundary: true,
      boundaryStatus: 'reconciliation_remediation_boundary',
      signalingReasonCodes: [
        'remediation_boundary_truth_unresolved',
        'remediation_boundary_nonconverged_state',
        'remediation_boundary_finalization_blocked_nonconverged',
      ],
    });
  });

  test('uncertain remediation applicability fails closed into explicit signaling', async () => {
    await expect(signalReconciliationRemediationBoundary({
      remediationBoundaryUnknown: true,
      finalizationBoundary: {
        mayFinalizeAsSuccess: false,
        boundaryDecision: 'block_success',
        blockingReasonCodes: ['finalization_boundary_attempt_blocked'],
      },
    })).resolves.toEqual({
      isInRemediationBoundary: true,
      boundaryStatus: 'reconciliation_remediation_boundary',
      signalingReasonCodes: ['remediation_boundary_uncertain'],
    });
  });

  test('deterministic signaling reason ordering and deduplication', async () => {
    const result = await signalReconciliationRemediationBoundary({
      businessSuccessRequested: true,
      remediationBoundaryUnknown: true,
      nonConvergedState: true,
      finalizationBoundary: {
        mayFinalizeAsSuccess: false,
        boundaryDecision: 'block_success',
        blockingReasonCodes: [
          'finalization_boundary_uncertain',
          'prior_outcome_unreconcilable',
          'prior_outcome_unreconcilable',
          'authoritative_outcome_unknown',
          'finalization_boundary_stock_unresolved',
        ],
      },
    });

    expect(result).toEqual({
      isInRemediationBoundary: true,
      boundaryStatus: 'reconciliation_remediation_boundary',
      signalingReasonCodes: [
        'remediation_boundary_truth_unresolved',
        'remediation_boundary_authoritative_outcome_unreconciled',
        'remediation_boundary_nonconverged_state',
        'remediation_boundary_finalization_blocked_nonconverged',
        'remediation_boundary_divergent_repeated_handling',
        'remediation_boundary_uncertain',
        'remediation_boundary_incompatible_success_state',
      ],
    });
    expect(new Set(result.signalingReasonCodes).size).toBe(result.signalingReasonCodes.length);
  });

  test('no side effects / no writes', async () => {
    const deps = {
      enforceFinalizationBoundary: jest.fn(async () => ({
        mayFinalizeAsSuccess: false,
        boundaryDecision: 'block_success',
        blockingReasonCodes: ['finalization_boundary_stock_unresolved'],
      })),
      save: jest.fn(),
      update: jest.fn(),
      write: jest.fn(),
    };

    await signalReconciliationRemediationBoundary(
      { boundaryInput: { attemptInput: { productId: 'prod_1' } }, nonConvergedState: true },
      deps,
    );

    expect(deps.enforceFinalizationBoundary).toHaveBeenCalledTimes(1);
    expect(deps.save).not.toHaveBeenCalled();
    expect(deps.update).not.toHaveBeenCalled();
    expect(deps.write).not.toHaveBeenCalled();
  });

  test('no leakage into remediation workflow/refund/provider-recovery logic', async () => {
    const result = await signalReconciliationRemediationBoundary({
      finalizationBoundary: {
        mayFinalizeAsSuccess: true,
        boundaryDecision: 'allow_success',
        blockingReasonCodes: [],
      },
      treatBlockedAsOrdinaryNonSuccess: true,
    });

    expect(result).toEqual({
      isInRemediationBoundary: false,
      boundaryStatus: 'normal_non_success',
      signalingReasonCodes: [],
    });

    expect(Object.keys(result).sort()).toEqual(['boundaryStatus', 'isInRemediationBoundary', 'signalingReasonCodes']);
    expect(result).not.toHaveProperty('remediationAction');
    expect(result).not.toHaveProperty('refundDecision');
    expect(result).not.toHaveProperty('providerRecoveryAction');
  });

  test('R5 does not absorb R1/R2/R3/R4 responsibilities and only consumes R4 output', async () => {
    const enforceFinalizationBoundary = jest.fn(async () => ({
      mayFinalizeAsSuccess: false,
      boundaryDecision: 'block_success',
      blockingReasonCodes: ['finalization_boundary_classification_unclassifiable'],
    }));

    const deps = {
      enforceFinalizationBoundary,
      resolveStockBearingTarget: jest.fn(),
      coordinateDecrementAttempt: jest.fn(),
      classifyDecrementHandlingAttempt: jest.fn(),
    };

    await signalReconciliationRemediationBoundary({ boundaryInput: { productId: 'prod_1' } }, deps);

    expect(enforceFinalizationBoundary).toHaveBeenCalledTimes(1);
    expect(deps.resolveStockBearingTarget).not.toHaveBeenCalled();
    expect(deps.coordinateDecrementAttempt).not.toHaveBeenCalled();
    expect(deps.classifyDecrementHandlingAttempt).not.toHaveBeenCalled();
  });
});
