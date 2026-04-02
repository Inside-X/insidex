import { resolveStockBearingTarget as defaultResolveStockBearingTarget } from './stock-bearing-target-resolution.js';

const CLASSIFICATIONS = Object.freeze([
  'authoritative_prior_outcome',
  'safe_replay',
  'duplicate_request',
  'new_intended_finalization',
  'unclassifiable',
]);

const REASON_ORDER = Object.freeze([
  'authoritative_outcome_unknown',
  'replay_safety_unknown',
  'duplicate_vs_new_uncertain',
  'identity_continuity_unresolved',
  'prior_outcome_unreconcilable',
  'repeated_handling_truth_divergence',
  'weak_same_intent_signal_only',
  'stock_target_continuity_unresolved',
  'stock_target_unresolved',
  'decrement_handling_classification_uncertain',
]);

function normalizeId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function addReason(reasons, code) {
  if (!code || reasons.has(code)) return;
  reasons.add(code);
}

function stableReasonCodes(reasons) {
  const ordered = [];
  const pending = new Set(reasons);

  for (const code of REASON_ORDER) {
    if (pending.has(code)) {
      ordered.push(code);
      pending.delete(code);
    }
  }

  return [...ordered, ...Array.from(pending).sort()];
}

function normalizeTarget(rawTarget) {
  if (!rawTarget || typeof rawTarget !== 'object') return null;

  const kind = normalizeId(rawTarget.kind);
  const productId = normalizeId(rawTarget.productId);
  const variantId = normalizeId(rawTarget.variantId);
  const sku = normalizeId(rawTarget.sku);

  if (!productId) return null;

  if (kind === 'product') {
    return {
      kind: 'product',
      productId,
      variantId: null,
      sku: null,
    };
  }

  if (kind === 'variant' && variantId) {
    return {
      kind: 'variant',
      productId,
      variantId,
      sku: sku || null,
    };
  }

  return null;
}

function isSameTarget(left, right) {
  if (!left || !right) return false;
  return (
    left.kind === right.kind
    && left.productId === right.productId
    && (left.variantId || '') === (right.variantId || '')
    && (left.sku || '') === (right.sku || '')
  );
}

function normalizeAuthoritativeOutcome(rawOutcome) {
  if (!rawOutcome || typeof rawOutcome !== 'object') return null;

  const outcomeKind = normalizeId(rawOutcome.outcomeKind);
  if (!outcomeKind) return null;

  const target = normalizeTarget(rawOutcome.target);
  if (rawOutcome.target && !target) return null;

  return {
    outcomeKind,
    target,
  };
}

function hasWeakSameIntentSignals(attemptInput, priorContext) {
  const input = attemptInput && typeof attemptInput === 'object' ? attemptInput : {};
  const prior = priorContext && typeof priorContext === 'object' ? priorContext : {};

  const weakFields = [
    input.clientDeclaredSameIntent,
    input.payloadFingerprint,
    input.externalReference,
    input.providerReference,
    input.productName,
    input.variantLabel,
    input.displayLabel,
    input.sku,
    input.productId,
    input.variantId,
    prior.externalReference,
    prior.providerReference,
  ];

  return weakFields.some((field) => {
    if (typeof field === 'boolean') return field;
    return normalizeId(field).length > 0;
  });
}

async function resolveAttemptTarget(attemptInput, dependencies, reasons) {
  const input = attemptInput && typeof attemptInput === 'object' ? attemptInput : {};
  const provided = normalizeTarget(input.resolvedTarget);
  if (provided) return provided;

  const resolveStockBearingTarget = dependencies.resolveStockBearingTarget || defaultResolveStockBearingTarget;
  const resolution = await resolveStockBearingTarget(input, dependencies);

  for (const code of resolution?.blockingReasonCodes || []) {
    addReason(reasons, code);
  }

  const resolvedTarget = normalizeTarget(resolution?.target);
  if (!resolvedTarget) {
    addReason(reasons, 'stock_target_continuity_unresolved');
    addReason(reasons, 'stock_target_unresolved');
  }

  return resolvedTarget;
}

export async function classifyDecrementHandlingAttempt(attemptInput, priorContext, dependencies = {}) {
  const input = attemptInput && typeof attemptInput === 'object' ? attemptInput : {};
  const prior = priorContext && typeof priorContext === 'object' ? priorContext : {};
  const reasons = new Set();

  const attemptTarget = await resolveAttemptTarget(input, dependencies, reasons);

  const authoritativeOutcome = normalizeAuthoritativeOutcome(prior.authoritativeOutcome);
  const priorHasAuthoritativeOutcome = prior.hasAuthoritativeOutcome === true || !!authoritativeOutcome;

  if (priorHasAuthoritativeOutcome && !authoritativeOutcome) {
    addReason(reasons, 'authoritative_outcome_unknown');
  }

  const attemptIntentKey = normalizeId(input.intendedFinalizationKey);
  const priorIntentKey = normalizeId(prior.intendedFinalizationKey);
  const attemptRequestKey = normalizeId(input.requestKey);
  const priorRequestKey = normalizeId(prior.requestKey);

  const weakOnlySignals = hasWeakSameIntentSignals(input, prior);

  if (!priorHasAuthoritativeOutcome) {
    if (prior.priorAttemptExists === true) {
      addReason(reasons, 'authoritative_outcome_unknown');
      addReason(reasons, 'duplicate_vs_new_uncertain');
    }

    if (!attemptIntentKey) {
      addReason(reasons, 'duplicate_vs_new_uncertain');
      if (weakOnlySignals) addReason(reasons, 'weak_same_intent_signal_only');
    }

    const blockingReasonCodes = stableReasonCodes(reasons);
    if (blockingReasonCodes.length > 0) {
      addReason(reasons, 'decrement_handling_classification_uncertain');
      return {
        classification: 'unclassifiable',
        authoritativeOutcome: null,
        blockingReasonCodes: stableReasonCodes(reasons),
      };
    }

    return {
      classification: 'new_intended_finalization',
      authoritativeOutcome: null,
      blockingReasonCodes: [],
    };
  }

  if (authoritativeOutcome?.target) {
    if (!attemptTarget) {
      addReason(reasons, 'stock_target_continuity_unresolved');
    } else if (!isSameTarget(authoritativeOutcome.target, attemptTarget)) {
      addReason(reasons, 'prior_outcome_unreconcilable');
      addReason(reasons, 'repeated_handling_truth_divergence');
    }
  }

  if (!attemptIntentKey || !priorIntentKey) {
    addReason(reasons, 'identity_continuity_unresolved');
    addReason(reasons, 'duplicate_vs_new_uncertain');
    if (weakOnlySignals) addReason(reasons, 'weak_same_intent_signal_only');
  }

  const hasContinuityKeys = attemptIntentKey && priorIntentKey;
  if (hasContinuityKeys && attemptIntentKey !== priorIntentKey) {
    const blockingReasonCodes = stableReasonCodes(reasons);
    if (blockingReasonCodes.length > 0) {
      addReason(reasons, 'decrement_handling_classification_uncertain');
      return {
        classification: 'unclassifiable',
        authoritativeOutcome: null,
        blockingReasonCodes: stableReasonCodes(reasons),
      };
    }

    return {
      classification: 'new_intended_finalization',
      authoritativeOutcome: null,
      blockingReasonCodes: [],
    };
  }

  if (attemptIntentKey && priorIntentKey && attemptIntentKey === priorIntentKey) {
    const blockingReasonCodes = stableReasonCodes(reasons);
    if (blockingReasonCodes.length > 0) {
      addReason(reasons, 'decrement_handling_classification_uncertain');
      return {
        classification: 'unclassifiable',
        authoritativeOutcome: null,
        blockingReasonCodes: stableReasonCodes(reasons),
      };
    }

    if (attemptRequestKey && priorRequestKey && attemptRequestKey === priorRequestKey) {
      return {
        classification: 'duplicate_request',
        authoritativeOutcome,
        blockingReasonCodes: [],
      };
    }

    if (attemptRequestKey && priorRequestKey && attemptRequestKey !== priorRequestKey) {
      return {
        classification: 'safe_replay',
        authoritativeOutcome,
        blockingReasonCodes: [],
      };
    }

    return {
      classification: 'authoritative_prior_outcome',
      authoritativeOutcome,
      blockingReasonCodes: [],
    };
  }

  addReason(reasons, 'replay_safety_unknown');
  addReason(reasons, 'duplicate_vs_new_uncertain');
  if (weakOnlySignals) addReason(reasons, 'weak_same_intent_signal_only');
  addReason(reasons, 'decrement_handling_classification_uncertain');

  return {
    classification: 'unclassifiable',
    authoritativeOutcome: null,
    blockingReasonCodes: stableReasonCodes(reasons),
  };
}

export { CLASSIFICATIONS };

export default classifyDecrementHandlingAttempt;
