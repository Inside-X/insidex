import { resolveStockBearingTarget as defaultResolveStockBearingTarget } from './stock-bearing-target-resolution.js';

const REASON_ORDER = Object.freeze([
  'multiple_stock_targets',
  'stock_target_ambiguous',
  'product_variant_conflict',
  'sku_variant_mismatch',
  'sku_unresolved',
  'identity_continuity_unresolved',
  'weak_identity_signal_only',
  'stock_target_unresolved',
  'decrement_attempt_target_conflict',
  'stock_truth_unverifiable',
  'stock_truth_unavailable',
  'decrement_attempt_coordination_uncertain',
]);

function normalizeId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function addReason(reasons, code) {
  if (!code || reasons.has(code)) return;
  reasons.add(code);
}

function stableReasonCodes(reasons) {
  const output = [];
  const pending = new Set(reasons);

  for (const code of REASON_ORDER) {
    if (pending.has(code)) {
      output.push(code);
      pending.delete(code);
    }
  }

  return [...output, ...Array.from(pending).sort()];
}

function normalizeResolvedTarget(rawTarget) {
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

function isTargetCompatibleWithAttempt(target, attemptInput) {
  const inputProductId = normalizeId(attemptInput?.productId);
  const inputVariantId = normalizeId(attemptInput?.variantId);
  const inputSku = normalizeId(attemptInput?.sku);

  if (inputProductId && inputProductId !== target.productId) return false;
  if (inputVariantId && inputVariantId !== (target.variantId || '')) return false;
  if (inputSku && target.kind === 'variant' && target.sku && inputSku !== target.sku) return false;

  return true;
}

export async function coordinateDecrementAttempt(attemptInput, dependencies = {}) {
  const input = attemptInput && typeof attemptInput === 'object' ? attemptInput : {};
  const resolveStockBearingTarget = dependencies.resolveStockBearingTarget || defaultResolveStockBearingTarget;
  const reasons = new Set();

  let resolvedTarget = normalizeResolvedTarget(input.resolvedTarget);
  if (!resolvedTarget) {
    const resolution = await resolveStockBearingTarget(input, dependencies);
    for (const code of resolution?.blockingReasonCodes || []) {
      addReason(reasons, code);
    }
    resolvedTarget = normalizeResolvedTarget(resolution?.target);
  }

  if (!resolvedTarget) {
    addReason(reasons, 'stock_target_unresolved');
  }

  if (resolvedTarget && !isTargetCompatibleWithAttempt(resolvedTarget, input)) {
    addReason(reasons, 'decrement_attempt_target_conflict');
  }

  const stockTruth = input.stockTruth && typeof input.stockTruth === 'object' ? input.stockTruth : null;
  if (!stockTruth || stockTruth.isVerifiable !== true) {
    addReason(reasons, 'stock_truth_unverifiable');
  }

  if (stockTruth?.isVerifiable === true && stockTruth.isAvailable !== true) {
    addReason(reasons, 'stock_truth_unavailable');
  }

  if (reasons.size > 0) {
    addReason(reasons, 'decrement_attempt_coordination_uncertain');
  }

  const blockingReasonCodes = stableReasonCodes(reasons);

  return {
    canAttempt: blockingReasonCodes.length === 0,
    resolvedTarget: blockingReasonCodes.length === 0 ? resolvedTarget : null,
    blockingReasonCodes,
  };
}

export default coordinateDecrementAttempt;
