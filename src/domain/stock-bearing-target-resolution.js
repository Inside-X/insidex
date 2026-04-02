const REASON_ORDER = Object.freeze([
  'multiple_stock_targets',
  'stock_target_ambiguous',
  'product_variant_conflict',
  'sku_variant_mismatch',
  'sku_unresolved',
  'identity_continuity_unresolved',
  'weak_identity_signal_only',
  'stock_target_unresolved',
]);

function normalizeId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function addReason(reasons, code) {
  if (!code || reasons.has(code)) return;
  reasons.add(code);
}

function stableReasonCodes(reasons) {
  const unknown = [];
  const set = new Set(reasons);

  for (const code of REASON_ORDER) {
    if (set.has(code)) {
      unknown.push(code);
      set.delete(code);
    }
  }

  return [...unknown, ...Array.from(set).sort()];
}

function hasWeakIdentitySignals(input) {
  const weakKeys = ['productName', 'variantLabel', 'displayLabel', 'imageUrl', 'mediaUrl', 'textHint'];
  return weakKeys.some((key) => normalizeId(input?.[key]).length > 0);
}

function unresolved(reasons) {
  addReason(reasons, 'stock_target_unresolved');
  return {
    isResolved: false,
    target: null,
    blockingReasonCodes: stableReasonCodes(reasons),
  };
}

export async function resolveStockBearingTarget(attemptInput, dependencies = {}) {
  const input = attemptInput && typeof attemptInput === 'object' ? attemptInput : {};
  const productId = normalizeId(input.productId);
  const variantId = normalizeId(input.variantId);
  const sku = normalizeId(input.sku);
  const reasons = new Set();

  if (hasWeakIdentitySignals(input)) {
    addReason(reasons, 'weak_identity_signal_only');
  }

  if (sku) {
    if (typeof dependencies.resolveVariantBySku !== 'function') {
      addReason(reasons, 'sku_unresolved');
      addReason(reasons, 'identity_continuity_unresolved');
      return unresolved(reasons);
    }

    const lookupResult = await Promise.resolve(dependencies.resolveVariantBySku(sku));
    const candidates = Array.isArray(lookupResult)
      ? lookupResult.filter(Boolean)
      : lookupResult
        ? [lookupResult]
        : [];

    if (candidates.length !== 1) {
      if (candidates.length > 1) {
        addReason(reasons, 'multiple_stock_targets');
        addReason(reasons, 'stock_target_ambiguous');
      } else {
        addReason(reasons, 'sku_unresolved');
      }
      return unresolved(reasons);
    }

    const candidate = candidates[0];
    const resolvedVariantId = normalizeId(candidate.variantId);
    const resolvedProductId = normalizeId(candidate.productId);

    if (!resolvedVariantId || !resolvedProductId) {
      addReason(reasons, 'identity_continuity_unresolved');
      return unresolved(reasons);
    }

    if (variantId && variantId !== resolvedVariantId) {
      addReason(reasons, 'sku_variant_mismatch');
    }
    if (productId && productId !== resolvedProductId) {
      addReason(reasons, 'product_variant_conflict');
    }

    if (reasons.size > 0) {
      return unresolved(reasons);
    }

    return {
      isResolved: true,
      target: {
        kind: 'variant',
        productId: resolvedProductId,
        variantId: resolvedVariantId,
        sku,
      },
      blockingReasonCodes: [],
    };
  }

  if (variantId && productId) {
    return {
      isResolved: true,
      target: {
        kind: 'variant',
        productId,
        variantId,
        sku: null,
      },
      blockingReasonCodes: [],
    };
  }

  if (variantId && !productId) {
    addReason(reasons, 'identity_continuity_unresolved');
    return unresolved(reasons);
  }

  if (productId) {
    return {
      isResolved: true,
      target: {
        kind: 'product',
        productId,
        variantId: null,
        sku: null,
      },
      blockingReasonCodes: [],
    };
  }

  return unresolved(reasons);
}

export default resolveStockBearingTarget;
