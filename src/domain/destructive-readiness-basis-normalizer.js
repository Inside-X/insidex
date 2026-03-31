const BOOLEAN_FIELDS = Object.freeze([
  Object.freeze({ key: 'hasDestructiveAuthorization', requiredValue: true }),
  Object.freeze({ key: 'isAuthorizationFresh', requiredValue: true }),
  Object.freeze({ key: 'isDestructiveModeExplicitlyApproved', requiredValue: true }),
  Object.freeze({ key: 'hasApprovedSnapshotBasis', requiredValue: true }),
  Object.freeze({ key: 'hasSufficientCompletenessBasis', requiredValue: true }),
  Object.freeze({ key: 'hasAvailableAuditabilityBasis', requiredValue: true }),
  Object.freeze({ key: 'isTargetEnvironmentApproved', requiredValue: true }),
  Object.freeze({ key: 'isTargetScopeApproved', requiredValue: true }),
  Object.freeze({ key: 'isDestructiveEligibilityCurrentlySatisfied', requiredValue: true }),
  Object.freeze({ key: 'hasUnresolvedAmbiguity', requiredValue: false }),
  Object.freeze({ key: 'hasProtectedExclusion', requiredValue: false }),
  Object.freeze({ key: 'areFailAbortConditionsDefined', requiredValue: true }),
  Object.freeze({ key: 'hasCandidateSetDrift', requiredValue: false }),
  Object.freeze({ key: 'hasAssetStateDrift', requiredValue: false }),
  Object.freeze({ key: 'hasReferenceStatusDrift', requiredValue: false }),
  Object.freeze({ key: 'hasProtectedStatusDrift', requiredValue: false }),
  Object.freeze({ key: 'hasScopeDrift', requiredValue: false }),
  Object.freeze({ key: 'hasEnvironmentDrift', requiredValue: false }),
  Object.freeze({ key: 'hasPolicyVersionDrift', requiredValue: false }),
  Object.freeze({ key: 'isDestructiveEligibilityUncertain', requiredValue: false }),
  Object.freeze({ key: 'areConditionsSatisfiedUncertain', requiredValue: false }),
  Object.freeze({ key: 'hasReversibleStatusConflict', requiredValue: false }),
]);

export const DESTRUCTIVE_READINESS_VALIDATION_ERRORS = Object.freeze({
  INVALID_TOP_LEVEL_INPUT: 'INVALID_TOP_LEVEL_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  INVALID_BOOLEAN_FIELD: 'INVALID_BOOLEAN_FIELD',
});

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function createFailClosedBasis() {
  const basis = {};
  for (const field of BOOLEAN_FIELDS) {
    basis[field.key] = !field.requiredValue;
  }
  return basis;
}

export function normalizeDestructiveReadinessBasis(rawInput) {
  const basis = createFailClosedBasis();
  const validationErrorSet = new Set();
  const input = isObject(rawInput) ? rawInput : null;

  if (!input) {
    validationErrorSet.add(DESTRUCTIVE_READINESS_VALIDATION_ERRORS.INVALID_TOP_LEVEL_INPUT);
  }

  for (const field of BOOLEAN_FIELDS) {
    const value = input ? input[field.key] : undefined;

    if (typeof value === 'undefined') {
      validationErrorSet.add(`${DESTRUCTIVE_READINESS_VALIDATION_ERRORS.MISSING_REQUIRED_FIELD}:${field.key}`);
      continue;
    }

    if (typeof value !== 'boolean') {
      validationErrorSet.add(`${DESTRUCTIVE_READINESS_VALIDATION_ERRORS.INVALID_BOOLEAN_FIELD}:${field.key}`);
      continue;
    }

    basis[field.key] = value;
  }

  const validationErrorCodes = Array.from(validationErrorSet);
  return {
    isValid: validationErrorCodes.length === 0,
    basis,
    validationErrorCodes,
  };
}

export default normalizeDestructiveReadinessBasis;
