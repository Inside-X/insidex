import { mediaUploadRepository } from '../repositories/media-upload.repository.js';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asBooleanOrDefault(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeTargetAssetUrls(rawInput) {
  if (!Array.isArray(rawInput?.targetAssetUrls)) {
    return [];
  }

  return rawInput.targetAssetUrls
    .filter((value) => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export async function buildDestructiveReadinessBasisFromState(rawInput, dependencies = {}) {
  const input = isObject(rawInput) ? rawInput : {};
  const repository = dependencies.mediaUploadRepository || mediaUploadRepository;

  const targetAssetUrls = normalizeTargetAssetUrls(input);
  const uniqueTargetAssetUrls = Array.from(new Set(targetAssetUrls));
  const hasDeterministicScope = uniqueTargetAssetUrls.length > 0 && uniqueTargetAssetUrls.length === targetAssetUrls.length;

  let finalizedAssets = null;
  let candidateAssets = null;

  if (repository && typeof repository.listFinalizedAssets === 'function' && typeof repository.listCleanupDryRunCandidates === 'function') {
    [finalizedAssets, candidateAssets] = await Promise.all([
      repository.listFinalizedAssets(),
      repository.listCleanupDryRunCandidates(),
    ]);
  }

  const stateReadSucceeded = Array.isArray(finalizedAssets) && Array.isArray(candidateAssets);
  const finalizedByUrl = new Map(
    stateReadSucceeded
      ? finalizedAssets
        .filter((asset) => typeof asset?.url === 'string')
        .map((asset) => [asset.url, asset])
      : [],
  );
  const candidateUrls = new Set(
    stateReadSucceeded
      ? candidateAssets
        .filter((asset) => typeof asset?.url === 'string')
        .map((asset) => asset.url)
      : [],
  );

  const matchedAssets = uniqueTargetAssetUrls
    .map((url) => finalizedByUrl.get(url))
    .filter(Boolean);

  const scopeExists = stateReadSucceeded && hasDeterministicScope && matchedAssets.length === uniqueTargetAssetUrls.length;
  const referencedAssetCount = matchedAssets.filter((asset) => asset.isReferenced || (asset.referenceCount || 0) > 0).length;
  const hasReferencedAssetsInScope = referencedAssetCount > 0;
  const candidateCoverageCount = uniqueTargetAssetUrls.filter((url) => candidateUrls.has(url)).length;
  const hasFullCandidateCoverage = scopeExists && candidateCoverageCount === uniqueTargetAssetUrls.length;

  const hasMissingStateFacts = !stateReadSucceeded || !scopeExists;
  const hasAmbiguousStateFacts = !hasDeterministicScope;

  const rawBasis = {
    hasDestructiveAuthorization: asBooleanOrDefault(input.hasDestructiveAuthorization, false),
    isAuthorizationFresh: asBooleanOrDefault(input.isAuthorizationFresh, false),
    isDestructiveModeExplicitlyApproved: asBooleanOrDefault(input.isDestructiveModeExplicitlyApproved, false),
    hasApprovedSnapshotBasis: asBooleanOrDefault(input.hasApprovedSnapshotBasis, false),
    hasSufficientCompletenessBasis: asBooleanOrDefault(input.hasSufficientCompletenessBasis, false),
    hasAvailableAuditabilityBasis: asBooleanOrDefault(input.hasAvailableAuditabilityBasis, false),
    isTargetEnvironmentApproved: asBooleanOrDefault(input.isTargetEnvironmentApproved, false),
    isTargetScopeApproved: scopeExists && !hasReferencedAssetsInScope,
    isDestructiveEligibilityCurrentlySatisfied: hasFullCandidateCoverage && !hasReferencedAssetsInScope,
    hasUnresolvedAmbiguity: hasMissingStateFacts || hasAmbiguousStateFacts || asBooleanOrDefault(input.hasUnresolvedAmbiguity, false),
    hasProtectedExclusion: hasReferencedAssetsInScope || asBooleanOrDefault(input.hasProtectedExclusion, false),
    areFailAbortConditionsDefined: asBooleanOrDefault(input.areFailAbortConditionsDefined, false),
    hasCandidateSetDrift: asBooleanOrDefault(input.hasCandidateSetDrift, true),
    hasAssetStateDrift: asBooleanOrDefault(input.hasAssetStateDrift, true),
    hasReferenceStatusDrift: asBooleanOrDefault(input.hasReferenceStatusDrift, true),
    hasProtectedStatusDrift: asBooleanOrDefault(input.hasProtectedStatusDrift, true),
    hasScopeDrift: asBooleanOrDefault(input.hasScopeDrift, true),
    hasEnvironmentDrift: asBooleanOrDefault(input.hasEnvironmentDrift, true),
    hasPolicyVersionDrift: asBooleanOrDefault(input.hasPolicyVersionDrift, true),
    isDestructiveEligibilityUncertain: asBooleanOrDefault(input.isDestructiveEligibilityUncertain, true) || hasMissingStateFacts || hasAmbiguousStateFacts,
    areConditionsSatisfiedUncertain: asBooleanOrDefault(input.areConditionsSatisfiedUncertain, true) || hasMissingStateFacts || hasAmbiguousStateFacts,
    hasReversibleStatusConflict: asBooleanOrDefault(input.hasReversibleStatusConflict, true),
  };

  return {
    rawBasis,
    sourceFacts: {
      targetAssetUrls: uniqueTargetAssetUrls,
      hasDeterministicScope,
      stateReadSucceeded,
      scopeExists,
      matchedAssetCount: matchedAssets.length,
      referencedAssetCount,
      candidateCoverageCount,
      hasMissingStateFacts,
      hasAmbiguousStateFacts,
    },
  };
}

export default buildDestructiveReadinessBasisFromState;
