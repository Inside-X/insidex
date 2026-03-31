import normalizeDestructiveReadinessBasis from './destructive-readiness-basis-normalizer.js';
import evaluateDestructiveReadiness from './destructive-readiness-evaluator.js';

export function assessDestructiveReadiness(rawInput) {
  const normalized = normalizeDestructiveReadinessBasis(rawInput);
  const evaluated = evaluateDestructiveReadiness(normalized.basis);

  return {
    isValid: normalized.isValid,
    validationErrorCodes: normalized.validationErrorCodes,
    basis: normalized.basis,
    isEligible: evaluated.isEligible,
    blockingReasonCodes: evaluated.blockingReasonCodes,
  };
}

export default assessDestructiveReadiness;
