import { coordinateDecrementAttempt as defaultCoordinateDecrementAttempt } from './decrement-attempt-coordinator.js';
import { classifyDecrementHandlingAttempt as defaultClassifyDecrementHandlingAttempt } from './decrement-handling-attempt-classifier.js';

const REASON_ORDER = Object.freeze([
  'finalization_boundary_stock_unresolved',
  'finalization_boundary_attempt_blocked',
  'finalization_boundary_classification_unclassifiable',
  'finalization_boundary_truth_divergence',
  'finalization_boundary_authoritative_outcome_conflict',
  'finalization_boundary_contradictory_success_signal',
  'finalization_boundary_uncertain',
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

function normalizeCoordination(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    canAttempt: raw.canAttempt === true,
    resolvedTarget: raw.resolvedTarget && typeof raw.resolvedTarget === 'object' ? raw.resolvedTarget : null,
    blockingReasonCodes: Array.isArray(raw.blockingReasonCodes) ? raw.blockingReasonCodes.filter(Boolean) : [],
  };
}

function normalizeClassification(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    classification: normalizeId(raw.classification),
    authoritativeOutcome: raw.authoritativeOutcome && typeof raw.authoritativeOutcome === 'object' ? raw.authoritativeOutcome : null,
    blockingReasonCodes: Array.isArray(raw.blockingReasonCodes) ? raw.blockingReasonCodes.filter(Boolean) : [],
  };
}

function hasContradictoryAuthoritativeOutcome(classification) {
  const outcomeKind = normalizeId(classification?.authoritativeOutcome?.outcomeKind).toLowerCase();
  if (!outcomeKind) return false;

  return (
    outcomeKind.includes('fail')
    || outcomeKind.includes('reject')
    || outcomeKind.includes('block')
    || outcomeKind.includes('deny')
  );
}

function hasSuccessSignal(input) {
  return (
    input.orderSuccessRequested === true
    || input.paymentSuccessRequested === true
    || input.businessSuccessRequested === true
  );
}

export async function enforceFinalizationBoundary(boundaryInput, dependencies = {}) {
  const input = boundaryInput && typeof boundaryInput === 'object' ? boundaryInput : {};
  const reasons = new Set();

  const coordinateDecrementAttempt = dependencies.coordinateDecrementAttempt || defaultCoordinateDecrementAttempt;
  const classifyDecrementHandlingAttempt = dependencies.classifyDecrementHandlingAttempt || defaultClassifyDecrementHandlingAttempt;

  const coordination = normalizeCoordination(input.decrementAttemptCoordination)
    || normalizeCoordination(await coordinateDecrementAttempt(input.attemptInput || {}, dependencies));

  const classification = normalizeClassification(input.handlingClassification)
    || normalizeClassification(await classifyDecrementHandlingAttempt(input.attemptInput || {}, input.priorContext || {}, dependencies));

  for (const code of coordination?.blockingReasonCodes || []) {
    addReason(reasons, code);
  }
  for (const code of classification?.blockingReasonCodes || []) {
    addReason(reasons, code);
  }

  if (!coordination?.resolvedTarget || coordination.blockingReasonCodes.includes('stock_target_unresolved')) {
    addReason(reasons, 'finalization_boundary_stock_unresolved');
  }

  if (coordination?.canAttempt !== true) {
    addReason(reasons, 'finalization_boundary_attempt_blocked');
  }

  if (!classification || classification.classification === 'unclassifiable') {
    addReason(reasons, 'finalization_boundary_classification_unclassifiable');
  }

  if ((classification?.blockingReasonCodes || []).some((code) => (
    code === 'repeated_handling_truth_divergence' || code === 'prior_outcome_unreconcilable'
  ))) {
    addReason(reasons, 'finalization_boundary_truth_divergence');
  }

  if (hasContradictoryAuthoritativeOutcome(classification)) {
    addReason(reasons, 'finalization_boundary_authoritative_outcome_conflict');
  }

  if (hasSuccessSignal(input) && reasons.size > 0) {
    addReason(reasons, 'finalization_boundary_contradictory_success_signal');
  }

  if (reasons.size > 0) {
    addReason(reasons, 'finalization_boundary_uncertain');
  }

  const blockingReasonCodes = stableReasonCodes(reasons);

  return {
    mayFinalizeAsSuccess: blockingReasonCodes.length === 0,
    boundaryDecision: blockingReasonCodes.length === 0 ? 'allow_success' : 'block_success',
    blockingReasonCodes,
  };
}

export default enforceFinalizationBoundary;
