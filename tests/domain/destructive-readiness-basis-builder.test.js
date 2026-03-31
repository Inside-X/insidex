import { jest } from '@jest/globals';
import { buildDestructiveReadinessBasisFromState } from '../../src/domain/destructive-readiness-basis-builder.js';

function makeDependencies({ finalizedAssets = [], candidateAssets = [] } = {}) {
  return {
    mediaUploadRepository: {
      listFinalizedAssets: jest.fn().mockResolvedValue(finalizedAssets),
      listCleanupDryRunCandidates: jest.fn().mockResolvedValue(candidateAssets),
    },
  };
}

describe('destructive-readiness-basis-builder', () => {
  test('happy path derives stable raw basis from sufficient real state', async () => {
    const deps = makeDependencies({
      finalizedAssets: [{ url: 'https://cdn/a.jpg', isReferenced: false, referenceCount: 0 }],
      candidateAssets: [{ url: 'https://cdn/a.jpg' }],
    });

    const input = {
      targetAssetUrls: ['https://cdn/a.jpg'],
      hasDestructiveAuthorization: true,
      isAuthorizationFresh: true,
      isDestructiveModeExplicitlyApproved: true,
      hasApprovedSnapshotBasis: true,
      hasSufficientCompletenessBasis: true,
      hasAvailableAuditabilityBasis: true,
      isTargetEnvironmentApproved: true,
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

    const { rawBasis, sourceFacts } = await buildDestructiveReadinessBasisFromState(input, deps);

    expect(rawBasis.isTargetScopeApproved).toBe(true);
    expect(rawBasis.isDestructiveEligibilityCurrentlySatisfied).toBe(true);
    expect(rawBasis.hasUnresolvedAmbiguity).toBe(false);
    expect(rawBasis.hasProtectedExclusion).toBe(false);
    expect(sourceFacts).toEqual({
      targetAssetUrls: ['https://cdn/a.jpg'],
      hasDeterministicScope: true,
      stateReadSucceeded: true,
      scopeExists: true,
      matchedAssetCount: 1,
      referencedAssetCount: 0,
      candidateCoverageCount: 1,
      hasMissingStateFacts: false,
      hasAmbiguousStateFacts: false,
    });
  });

  test('missing real-state facts force fail-closed basis', async () => {
    const deps = makeDependencies({ finalizedAssets: null, candidateAssets: null });

    const { rawBasis, sourceFacts } = await buildDestructiveReadinessBasisFromState(
      { targetAssetUrls: ['https://cdn/a.jpg'] },
      deps,
    );

    expect(sourceFacts.stateReadSucceeded).toBe(false);
    expect(rawBasis.hasUnresolvedAmbiguity).toBe(true);
    expect(rawBasis.isTargetScopeApproved).toBe(false);
    expect(rawBasis.isDestructiveEligibilityCurrentlySatisfied).toBe(false);
    expect(rawBasis.isDestructiveEligibilityUncertain).toBe(true);
    expect(rawBasis.areConditionsSatisfiedUncertain).toBe(true);
  });

  test('ambiguous scope facts force fail-closed basis', async () => {
    const deps = makeDependencies({
      finalizedAssets: [{ url: 'https://cdn/a.jpg', isReferenced: false, referenceCount: 0 }],
      candidateAssets: [{ url: 'https://cdn/a.jpg' }],
    });

    const { rawBasis, sourceFacts } = await buildDestructiveReadinessBasisFromState(
      { targetAssetUrls: ['https://cdn/a.jpg', 'https://cdn/a.jpg'] },
      deps,
    );

    expect(sourceFacts.hasAmbiguousStateFacts).toBe(true);
    expect(rawBasis.hasUnresolvedAmbiguity).toBe(true);
    expect(rawBasis.isTargetScopeApproved).toBe(false);
  });

  test('protected/reference conflicts in real state are reflected in built basis', async () => {
    const deps = makeDependencies({
      finalizedAssets: [{ url: 'https://cdn/a.jpg', isReferenced: true, referenceCount: 2 }],
      candidateAssets: [{ url: 'https://cdn/a.jpg' }],
    });

    const { rawBasis, sourceFacts } = await buildDestructiveReadinessBasisFromState(
      { targetAssetUrls: ['https://cdn/a.jpg'] },
      deps,
    );

    expect(sourceFacts.referencedAssetCount).toBe(1);
    expect(rawBasis.hasProtectedExclusion).toBe(true);
    expect(rawBasis.isTargetScopeApproved).toBe(false);
    expect(rawBasis.isDestructiveEligibilityCurrentlySatisfied).toBe(false);
  });

  test('deterministic output for equivalent input/state', async () => {
    const deps = makeDependencies({
      finalizedAssets: [{ url: 'https://cdn/a.jpg', isReferenced: false, referenceCount: 0 }],
      candidateAssets: [{ url: 'https://cdn/a.jpg' }],
    });

    const input = { targetAssetUrls: ['https://cdn/a.jpg'] };
    const first = await buildDestructiveReadinessBasisFromState(input, deps);
    const second = await buildDestructiveReadinessBasisFromState(input, deps);

    expect(first).toEqual(second);
  });

  test('builder has no side effects and performs read-only repository access', async () => {
    const input = { targetAssetUrls: ['https://cdn/a.jpg'] };
    const snapshot = JSON.parse(JSON.stringify(input));
    const deps = makeDependencies({
      finalizedAssets: [{ url: 'https://cdn/a.jpg', isReferenced: false, referenceCount: 0 }],
      candidateAssets: [{ url: 'https://cdn/a.jpg' }],
    });

    await buildDestructiveReadinessBasisFromState(input, deps);

    expect(input).toEqual(snapshot);
    expect(deps.mediaUploadRepository.listFinalizedAssets).toHaveBeenCalledTimes(1);
    expect(deps.mediaUploadRepository.listCleanupDryRunCandidates).toHaveBeenCalledTimes(1);
  });
});
