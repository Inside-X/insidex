import assessDestructiveReadiness from '../../src/domain/destructive-readiness-assessor.js';
import {
  DESTRUCTIVE_READINESS_VALIDATION_ERRORS,
  normalizeDestructiveReadinessBasis,
} from '../../src/domain/destructive-readiness-basis-normalizer.js';
import {
  DESTRUCTIVE_READINESS_BLOCKING_REASONS,
  evaluateDestructiveReadiness,
} from '../../src/domain/destructive-readiness-evaluator.js';

function validRawInput() {
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

describe('destructive-readiness-assessor', () => {
  test('happy path: valid raw input yields valid basis and eligible true', () => {
    const result = assessDestructiveReadiness(validRawInput());

    expect(result.isValid).toBe(true);
    expect(result.validationErrorCodes).toEqual([]);
    expect(result.isEligible).toBe(true);
    expect(result.blockingReasonCodes).toEqual([]);
  });

  test('invalid raw input returns validation errors and remains fail-closed not eligible', () => {
    const result = assessDestructiveReadiness(null);

    expect(result.isValid).toBe(false);
    expect(result.validationErrorCodes[0]).toBe(
      DESTRUCTIVE_READINESS_VALIDATION_ERRORS.INVALID_TOP_LEVEL_INPUT,
    );
    expect(result.isEligible).toBe(false);
    expect(result.blockingReasonCodes.length).toBeGreaterThan(0);
  });

  test('valid normalized basis can still be blocked by evaluator rules', () => {
    const raw = validRawInput();
    raw.hasPolicyVersionDrift = true;

    const result = assessDestructiveReadiness(raw);

    expect(result.isValid).toBe(true);
    expect(result.isEligible).toBe(false);
    expect(result.blockingReasonCodes).toEqual([
      DESTRUCTIVE_READINESS_BLOCKING_REASONS.POLICY_VERSION_DRIFT_DETECTED,
    ]);
  });

  test('returns the exact normalized basis used by evaluator', () => {
    const raw = validRawInput();
    raw.hasDestructiveAuthorization = 'true';

    const normalized = normalizeDestructiveReadinessBasis(raw);
    const assessed = assessDestructiveReadiness(raw);

    expect(assessed.basis).toEqual(normalized.basis);
    expect(assessed.validationErrorCodes).toEqual(normalized.validationErrorCodes);
    expect(assessed.blockingReasonCodes).toEqual(
      evaluateDestructiveReadiness(normalized.basis).blockingReasonCodes,
    );
  });

  test('validation and blocking reason ordering remains deterministic', () => {
    const raw = validRawInput();
    raw.hasDestructiveAuthorization = 'yes';
    delete raw.hasApprovedSnapshotBasis;

    const first = assessDestructiveReadiness(raw);
    const second = assessDestructiveReadiness(raw);

    expect(first).toEqual(second);
    expect(first.validationErrorCodes).toEqual([
      `${DESTRUCTIVE_READINESS_VALIDATION_ERRORS.INVALID_BOOLEAN_FIELD}:hasDestructiveAuthorization`,
      `${DESTRUCTIVE_READINESS_VALIDATION_ERRORS.MISSING_REQUIRED_FIELD}:hasApprovedSnapshotBasis`,
    ]);
    expect(new Set(first.validationErrorCodes).size).toBe(first.validationErrorCodes.length);
    expect(new Set(first.blockingReasonCodes).size).toBe(first.blockingReasonCodes.length);
  });

  test('does not mutate raw input', () => {
    const raw = validRawInput();
    const snapshot = JSON.parse(JSON.stringify(raw));

    assessDestructiveReadiness(raw);

    expect(raw).toEqual(snapshot);
  });

  test('does not invent or suppress normalizer/evaluator outputs', () => {
    const raw = validRawInput();
    raw.hasDestructiveAuthorization = 'no';
    raw.hasPolicyVersionDrift = true;

    const normalized = normalizeDestructiveReadinessBasis(raw);
    const evaluated = evaluateDestructiveReadiness(normalized.basis);
    const assessed = assessDestructiveReadiness(raw);

    expect(assessed.isValid).toBe(normalized.isValid);
    expect(assessed.validationErrorCodes).toEqual(normalized.validationErrorCodes);
    expect(assessed.isEligible).toBe(evaluated.isEligible);
    expect(assessed.blockingReasonCodes).toEqual(evaluated.blockingReasonCodes);
  });
});
