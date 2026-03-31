import { jest } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import { buildTestToken } from '../helpers/jwt.helper.js';
import assessDestructiveReadiness from '../../src/domain/destructive-readiness-assessor.js';

const adminToken = buildTestToken({ role: 'admin', id: 'admin-readiness-1' });

function validPayload() {
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

describe('admin media destructive readiness inspection route', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete app.locals.destructiveReadinessAssessor;
    delete app.locals.mediaUploadRepository;
    delete app.locals.mediaStorageProviderFactory;
  });

  test('valid read-only request returns assessor result', async () => {
    const payload = validPayload();

    const response = await request(app)
      .post('/api/admin/media/uploads/destructive-readiness/inspect')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(200);

    expect(response.body.data.assessment).toEqual(assessDestructiveReadiness(payload));
  });

  test('malformed request input fails closed', async () => {
    const response = await request(app)
      .post('/api/admin/media/uploads/destructive-readiness/inspect')
      .set('Authorization', `Bearer ${adminToken}`)
      .send([])
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('blocking conditions return ineligible result and route performs no repository/provider actions', async () => {
    const payload = validPayload();
    payload.hasPolicyVersionDrift = true;

    const repository = {
      createUploadSession: jest.fn(),
      finalizeUploadByIdempotency: jest.fn(),
      listFinalizedAssets: jest.fn(),
      listOrphanedFinalizedAssets: jest.fn(),
      listCleanupDryRunCandidates: jest.fn(),
    };
    const providerFactory = jest.fn();

    app.locals.mediaUploadRepository = repository;
    app.locals.mediaStorageProviderFactory = providerFactory;

    const response = await request(app)
      .post('/api/admin/media/uploads/destructive-readiness/inspect')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(200);

    expect(response.body.data.assessment.isEligible).toBe(false);
    expect(repository.createUploadSession).not.toHaveBeenCalled();
    expect(repository.finalizeUploadByIdempotency).not.toHaveBeenCalled();
    expect(repository.listFinalizedAssets).not.toHaveBeenCalled();
    expect(repository.listOrphanedFinalizedAssets).not.toHaveBeenCalled();
    expect(repository.listCleanupDryRunCandidates).not.toHaveBeenCalled();
    expect(providerFactory).not.toHaveBeenCalled();
  });

  test('route uses only assessor output shape and is deterministic', async () => {
    const payload = validPayload();
    payload.hasDestructiveAuthorization = 'true';

    const first = await request(app)
      .post('/api/admin/media/uploads/destructive-readiness/inspect')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(200);

    const second = await request(app)
      .post('/api/admin/media/uploads/destructive-readiness/inspect')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(200);

    expect(first.body.data.assessment).toEqual(second.body.data.assessment);
  });

  test('route does not mutate request payload object', async () => {
    const payload = validPayload();
    const snapshot = JSON.parse(JSON.stringify(payload));

    await request(app)
      .post('/api/admin/media/uploads/destructive-readiness/inspect')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(200);

    expect(payload).toEqual(snapshot);
  });

  test('route wiring calls assessor without inventing/suppressing errors or blockers', async () => {
    const payload = validPayload();
    payload.hasDestructiveAuthorization = 'false';

    const assessorSpy = jest.fn((input) => assessDestructiveReadiness(input));
    app.locals.destructiveReadinessAssessor = assessorSpy;

    const response = await request(app)
      .post('/api/admin/media/uploads/destructive-readiness/inspect')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(200);

    expect(assessorSpy).toHaveBeenCalledTimes(1);
    expect(assessorSpy).toHaveBeenCalledWith(payload);
    expect(response.body.data.assessment).toEqual(assessDestructiveReadiness(payload));
  });
});
