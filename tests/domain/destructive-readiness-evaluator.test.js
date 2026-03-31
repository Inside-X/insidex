import {
  DESTRUCTIVE_READINESS_BLOCKING_REASONS,
  evaluateDestructiveReadiness,
} from '../../src/domain/destructive-readiness-evaluator.js';

function validBasis() {
  return {
    hasDestructiveAuthorization: true,
    isAuthorizationFresh: true,
    isDestructiveModeExplicitlyApproved: true,
    hasApprovedSnapshotBasis: true,
    hasSufficientCompletenessBasis: true,
    hasAvailableAuditabilityBasis: true,
    isTargetEnvironmentApproved: true,
    isTargetScopeApproved: true,
    isDestructiveEligibilityCurrentlySatisfied: true,
    hasUnresolvedAmbiguity: false,
    hasProtectedExclusion: false,
    areFailAbortConditionsDefined: true,
    hasCandidateSetDrift: false,
    hasAssetStateDrift: false,
    hasReferenceStatusDrift: false,
    hasProtectedStatusDrift: false,
    hasScopeDrift: false,
    hasEnvironmentDrift: false,
    hasPolicyVersionDrift: false,
    isDestructiveEligibilityUncertain: false,
    areConditionsSatisfiedUncertain: false,
    hasReversibleStatusConflict: false,
  };
}

describe('destructive-readiness-evaluator', () => {
  test('returns eligible true with empty blockers for a fully valid basis', () => {
    const result = evaluateDestructiveReadiness(validBasis());
    expect(result).toEqual({ isEligible: true, blockingReasonCodes: [] });
  });

  test('blocks each major contract category when its corresponding condition fails', () => {
    const cases = [
      ['hasDestructiveAuthorization', false, DESTRUCTIVE_READINESS_BLOCKING_REASONS.DESTRUCTIVE_AUTHORIZATION_MISSING],
      ['isAuthorizationFresh', false, DESTRUCTIVE_READINESS_BLOCKING_REASONS.DESTRUCTIVE_AUTHORIZATION_NOT_FRESH],
      ['isDestructiveModeExplicitlyApproved', false, DESTRUCTIVE_READINESS_BLOCKING_REASONS.DESTRUCTIVE_MODE_NOT_EXPLICITLY_APPROVED],
      ['hasApprovedSnapshotBasis', false, DESTRUCTIVE_READINESS_BLOCKING_REASONS.SNAPSHOT_BASIS_MISSING],
      ['hasSufficientCompletenessBasis', false, DESTRUCTIVE_READINESS_BLOCKING_REASONS.COMPLETENESS_BASIS_MISSING_OR_INSUFFICIENT],
      ['hasAvailableAuditabilityBasis', false, DESTRUCTIVE_READINESS_BLOCKING_REASONS.AUDITABILITY_BASIS_MISSING_OR_UNAVAILABLE],
      ['isTargetEnvironmentApproved', false, DESTRUCTIVE_READINESS_BLOCKING_REASONS.TARGET_ENVIRONMENT_NOT_APPROVED],
      ['isTargetScopeApproved', false, DESTRUCTIVE_READINESS_BLOCKING_REASONS.TARGET_SCOPE_NOT_APPROVED],
      ['isDestructiveEligibilityCurrentlySatisfied', false, DESTRUCTIVE_READINESS_BLOCKING_REASONS.DESTRUCTIVE_ELIGIBILITY_NOT_SATISFIED],
      ['hasUnresolvedAmbiguity', true, DESTRUCTIVE_READINESS_BLOCKING_REASONS.UNRESOLVED_AMBIGUITY_REMAINS],
      ['hasProtectedExclusion', true, DESTRUCTIVE_READINESS_BLOCKING_REASONS.PROTECTED_EXCLUSION_APPLIES],
      ['areFailAbortConditionsDefined', false, DESTRUCTIVE_READINESS_BLOCKING_REASONS.FAIL_ABORT_CONDITIONS_UNDEFINED],
      ['hasCandidateSetDrift', true, DESTRUCTIVE_READINESS_BLOCKING_REASONS.CANDIDATE_SET_DRIFT_DETECTED],
      ['hasAssetStateDrift', true, DESTRUCTIVE_READINESS_BLOCKING_REASONS.ASSET_STATE_DRIFT_DETECTED],
      ['hasReferenceStatusDrift', true, DESTRUCTIVE_READINESS_BLOCKING_REASONS.REFERENCE_STATUS_DRIFT_DETECTED],
      ['hasProtectedStatusDrift', true, DESTRUCTIVE_READINESS_BLOCKING_REASONS.PROTECTED_STATUS_DRIFT_DETECTED],
      ['hasScopeDrift', true, DESTRUCTIVE_READINESS_BLOCKING_REASONS.SCOPE_DRIFT_DETECTED],
      ['hasEnvironmentDrift', true, DESTRUCTIVE_READINESS_BLOCKING_REASONS.ENVIRONMENT_DRIFT_DETECTED],
      ['hasPolicyVersionDrift', true, DESTRUCTIVE_READINESS_BLOCKING_REASONS.POLICY_VERSION_DRIFT_DETECTED],
      ['isDestructiveEligibilityUncertain', true, DESTRUCTIVE_READINESS_BLOCKING_REASONS.DESTRUCTIVE_ELIGIBILITY_UNCERTAIN],
      ['areConditionsSatisfiedUncertain', true, DESTRUCTIVE_READINESS_BLOCKING_REASONS.CONDITIONS_SATISFIED_UNCERTAIN],
      ['hasReversibleStatusConflict', true, DESTRUCTIVE_READINESS_BLOCKING_REASONS.REVERSIBLE_STATUS_CONFLICT],
    ];

    for (const [key, failingValue, expectedReason] of cases) {
      const basis = validBasis();
      basis[key] = failingValue;

      const result = evaluateDestructiveReadiness(basis);
      expect(result.isEligible).toBe(false);
      expect(result.blockingReasonCodes).toEqual([expectedReason]);
    }
  });

  test('fails closed when required basis values are missing', () => {
    const basis = validBasis();
    delete basis.hasDestructiveAuthorization;
    delete basis.hasApprovedSnapshotBasis;

    const result = evaluateDestructiveReadiness(basis);
    expect(result.isEligible).toBe(false);
    expect(result.blockingReasonCodes).toEqual([
      DESTRUCTIVE_READINESS_BLOCKING_REASONS.DESTRUCTIVE_AUTHORIZATION_MISSING,
      DESTRUCTIVE_READINESS_BLOCKING_REASONS.SNAPSHOT_BASIS_MISSING,
    ]);
  });

  test('fails closed for non-object basis input', () => {
    expect(evaluateDestructiveReadiness(null).isEligible).toBe(false);
    expect(evaluateDestructiveReadiness(undefined).isEligible).toBe(false);
    expect(evaluateDestructiveReadiness('invalid').isEligible).toBe(false);
  });

  test('does not treat prior reversible/quarantine status as destructive eligibility', () => {
    const basis = validBasis();
    basis.hasReversibleStatusConflict = true;
    const result = evaluateDestructiveReadiness(basis);

    expect(result.isEligible).toBe(false);
    expect(result.blockingReasonCodes).toContain(
      DESTRUCTIVE_READINESS_BLOCKING_REASONS.REVERSIBLE_STATUS_CONFLICT,
    );
  });

  test('returns stable, deduplicated, deterministic blocker ordering', () => {
    const basis = validBasis();
    basis.hasDestructiveAuthorization = false;
    basis.hasApprovedSnapshotBasis = false;
    basis.hasPolicyVersionDrift = true;
    basis.hasReversibleStatusConflict = true;

    const first = evaluateDestructiveReadiness(basis);
    const second = evaluateDestructiveReadiness(basis);

    expect(first).toEqual(second);
    expect(first.blockingReasonCodes).toEqual([
      DESTRUCTIVE_READINESS_BLOCKING_REASONS.DESTRUCTIVE_AUTHORIZATION_MISSING,
      DESTRUCTIVE_READINESS_BLOCKING_REASONS.SNAPSHOT_BASIS_MISSING,
      DESTRUCTIVE_READINESS_BLOCKING_REASONS.POLICY_VERSION_DRIFT_DETECTED,
      DESTRUCTIVE_READINESS_BLOCKING_REASONS.REVERSIBLE_STATUS_CONFLICT,
    ]);
    expect(new Set(first.blockingReasonCodes).size).toBe(first.blockingReasonCodes.length);
  });

  test('has no side effects on input basis object', () => {
    const basis = validBasis();
    const snapshot = JSON.parse(JSON.stringify(basis));

    evaluateDestructiveReadiness(basis);

    expect(basis).toEqual(snapshot);
  });
});
