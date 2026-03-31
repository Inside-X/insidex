import evaluateDestructiveReadiness, {
  DESTRUCTIVE_READINESS_BLOCKING_REASONS,
} from '../../src/domain/destructive-readiness-evaluator.js';
import {
  DESTRUCTIVE_READINESS_VALIDATION_ERRORS,
  normalizeDestructiveReadinessBasis,
} from '../../src/domain/destructive-readiness-basis-normalizer.js';

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

describe('destructive-readiness-basis-normalizer', () => {
  test('normalizes valid raw input into evaluator-compatible basis with no validation errors', () => {
    const raw = validRawInput();
    const result = normalizeDestructiveReadinessBasis(raw);

    expect(result.isValid).toBe(true);
    expect(result.validationErrorCodes).toEqual([]);
    expect(result.basis).toEqual(raw);
    expect(evaluateDestructiveReadiness(result.basis)).toEqual({
      isEligible: true,
      blockingReasonCodes: [],
    });
  });

  test('fails closed for malformed top-level input', () => {
    for (const malformed of [null, undefined, [], 'x', 7, true]) {
      const result = normalizeDestructiveReadinessBasis(malformed);

      expect(result.isValid).toBe(false);
      expect(result.validationErrorCodes[0]).toBe(
        DESTRUCTIVE_READINESS_VALIDATION_ERRORS.INVALID_TOP_LEVEL_INPUT,
      );
      expect(evaluateDestructiveReadiness(result.basis).isEligible).toBe(false);
    }
  });

  test('missing required fields produce deterministic validation errors', () => {
    const raw = validRawInput();
    delete raw.hasDestructiveAuthorization;
    delete raw.hasApprovedSnapshotBasis;

    const result = normalizeDestructiveReadinessBasis(raw);

    expect(result.isValid).toBe(false);
    expect(result.validationErrorCodes).toEqual([
      `${DESTRUCTIVE_READINESS_VALIDATION_ERRORS.MISSING_REQUIRED_FIELD}:hasDestructiveAuthorization`,
      `${DESTRUCTIVE_READINESS_VALIDATION_ERRORS.MISSING_REQUIRED_FIELD}:hasApprovedSnapshotBasis`,
    ]);
  });

  test('ambiguous boolean-like values are rejected (no permissive coercion)', () => {
    const raw = validRawInput();
    raw.hasDestructiveAuthorization = 'true';
    raw.isAuthorizationFresh = 1;
    raw.hasUnresolvedAmbiguity = 'false';

    const result = normalizeDestructiveReadinessBasis(raw);

    expect(result.isValid).toBe(false);
    expect(result.validationErrorCodes).toEqual([
      `${DESTRUCTIVE_READINESS_VALIDATION_ERRORS.INVALID_BOOLEAN_FIELD}:hasDestructiveAuthorization`,
      `${DESTRUCTIVE_READINESS_VALIDATION_ERRORS.INVALID_BOOLEAN_FIELD}:isAuthorizationFresh`,
      `${DESTRUCTIVE_READINESS_VALIDATION_ERRORS.INVALID_BOOLEAN_FIELD}:hasUnresolvedAmbiguity`,
    ]);
  });

  test('unknown extra keys do not influence normalized basis or evaluator outcome', () => {
    const raw = {
      ...validRawInput(),
      extraKey: 'unexpected',
      nested: { risky: true },
    };

    const result = normalizeDestructiveReadinessBasis(raw);
    expect(result.isValid).toBe(true);
    expect(result.basis.extraKey).toBeUndefined();
    expect(result.basis.nested).toBeUndefined();
    expect(evaluateDestructiveReadiness(result.basis).isEligible).toBe(true);
  });

  test('normalized output is deterministic and stable for equivalent valid input', () => {
    const first = normalizeDestructiveReadinessBasis(validRawInput());
    const second = normalizeDestructiveReadinessBasis(validRawInput());

    expect(first).toEqual(second);
  });

  test('validation errors are stably ordered and deduplicated', () => {
    const raw = validRawInput();
    raw.hasDestructiveAuthorization = 'yes';
    delete raw.hasApprovedSnapshotBasis;

    const first = normalizeDestructiveReadinessBasis(raw);
    const second = normalizeDestructiveReadinessBasis(raw);

    expect(first.validationErrorCodes).toEqual([
      `${DESTRUCTIVE_READINESS_VALIDATION_ERRORS.INVALID_BOOLEAN_FIELD}:hasDestructiveAuthorization`,
      `${DESTRUCTIVE_READINESS_VALIDATION_ERRORS.MISSING_REQUIRED_FIELD}:hasApprovedSnapshotBasis`,
    ]);
    expect(first.validationErrorCodes).toEqual(second.validationErrorCodes);
    expect(new Set(first.validationErrorCodes).size).toBe(first.validationErrorCodes.length);
  });

  test('invalid normalized basis remains blocking when consumed by evaluator', () => {
    const raw = validRawInput();
    raw.hasDestructiveAuthorization = 'true';

    const normalized = normalizeDestructiveReadinessBasis(raw);
    const evaluated = evaluateDestructiveReadiness(normalized.basis);

    expect(normalized.isValid).toBe(false);
    expect(evaluated.isEligible).toBe(false);
    expect(evaluated.blockingReasonCodes).toContain(
      DESTRUCTIVE_READINESS_BLOCKING_REASONS.DESTRUCTIVE_AUTHORIZATION_MISSING,
    );
  });

  test('has no side effects on raw input', () => {
    const raw = validRawInput();
    const snapshot = JSON.parse(JSON.stringify(raw));

    normalizeDestructiveReadinessBasis(raw);

    expect(raw).toEqual(snapshot);
  });
});
