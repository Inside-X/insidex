import { enforceFinalizationBoundary as defaultEnforceFinalizationBoundary } from './finalization-boundary-enforcer.js';

const REASON_ORDER = Object.freeze([
  'remediation_boundary_truth_unresolved',
  'remediation_boundary_authoritative_outcome_unreconciled',
  'remediation_boundary_nonconverged_state',
  'remediation_boundary_finalization_blocked_nonconverged',
  'remediation_boundary_divergent_repeated_handling',
  'remediation_boundary_uncertain',
  'remediation_boundary_incompatible_success_state',
]);

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

function normalizeBoundary(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    mayFinalizeAsSuccess: raw.mayFinalizeAsSuccess === true,
    boundaryDecision: typeof raw.boundaryDecision === 'string' ? raw.boundaryDecision.trim() : '',
    blockingReasonCodes: Array.isArray(raw.blockingReasonCodes) ? raw.blockingReasonCodes.filter(Boolean) : [],
  };
}

function hasSuccessSignal(input) {
  return (
    input.orderSuccessRequested === true
    || input.paymentSuccessRequested === true
    || input.businessSuccessRequested === true
  );
}

function includesAny(codes, expected) {
  return expected.some((code) => codes.includes(code));
}

export async function signalReconciliationRemediationBoundary(signalInput, dependencies = {}) {
  const input = signalInput && typeof signalInput === 'object' ? signalInput : {};
  const reasons = new Set();

  const enforceFinalizationBoundary = dependencies.enforceFinalizationBoundary || defaultEnforceFinalizationBoundary;

  const boundary = normalizeBoundary(input.finalizationBoundary)
    || normalizeBoundary(await enforceFinalizationBoundary(input.boundaryInput || input, dependencies));

  const boundaryCodes = boundary?.blockingReasonCodes || [];
  const boundaryBlocked = !boundary || boundary.mayFinalizeAsSuccess !== true || boundary.boundaryDecision !== 'allow_success';

  const hasDivergence = includesAny(boundaryCodes, [
    'finalization_boundary_truth_divergence',
    'repeated_handling_truth_divergence',
    'prior_outcome_unreconcilable',
  ]);

  const hasUnreconciledAuthority = includesAny(boundaryCodes, [
    'finalization_boundary_authoritative_outcome_conflict',
    'authoritative_outcome_unknown',
  ]);

  const hasUnresolvedTruth = includesAny(boundaryCodes, [
    'finalization_boundary_stock_unresolved',
    'finalization_boundary_classification_unclassifiable',
  ]);

  if (hasDivergence) {
    addReason(reasons, 'remediation_boundary_divergent_repeated_handling');
  }

  if (hasUnreconciledAuthority) {
    addReason(reasons, 'remediation_boundary_authoritative_outcome_unreconciled');
  }

  if (hasUnresolvedTruth) {
    addReason(reasons, 'remediation_boundary_truth_unresolved');
  }

  if (input.nonConvergedState === true) {
    addReason(reasons, 'remediation_boundary_nonconverged_state');
  }

  if (boundaryBlocked && (reasons.size > 0 || input.nonConvergedState === true)) {
    addReason(reasons, 'remediation_boundary_finalization_blocked_nonconverged');
  }

  if (hasSuccessSignal(input) && boundaryBlocked) {
    addReason(reasons, 'remediation_boundary_incompatible_success_state');
  }

  if (input.remediationBoundaryUnknown === true || includesAny(boundaryCodes, ['finalization_boundary_uncertain'])) {
    addReason(reasons, 'remediation_boundary_uncertain');
  }

  if (reasons.size === 0 && boundaryBlocked && input.treatBlockedAsOrdinaryNonSuccess !== true) {
    addReason(reasons, 'remediation_boundary_uncertain');
  }

  const signalingReasonCodes = stableReasonCodes(reasons);
  const isInRemediationBoundary = signalingReasonCodes.length > 0;

  return {
    isInRemediationBoundary,
    boundaryStatus: isInRemediationBoundary ? 'reconciliation_remediation_boundary' : 'normal_non_success',
    signalingReasonCodes,
  };
}

export default signalReconciliationRemediationBoundary;
