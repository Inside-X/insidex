import { jest } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import { buildTestToken } from '../helpers/jwt.helper.js';
import assessDestructiveReadiness from '../../src/domain/destructive-readiness-assessor.js';

const adminToken = buildTestToken({ role: 'admin', id: 'admin-readiness-1' });

function validPayload() {
  return {
    targetAssetUrls: ['https://cdn/a.jpg'],
  };
}

function mockReadOnlyRepository({
  finalizedAssets = [{ url: 'https://cdn/a.jpg', isReferenced: false, referenceCount: 0 }],
  candidateAssets = [{ url: 'https://cdn/a.jpg' }],
} = {}) {
  return {
    createUploadSession: jest.fn(),
    finalizeUploadByIdempotency: jest.fn(),
    listOrphanedFinalizedAssets: jest.fn(),
    listFinalizedAssets: jest.fn().mockResolvedValue(finalizedAssets),
    listCleanupDryRunCandidates: jest.fn().mockResolvedValue(candidateAssets),
  };
}

describe('admin media destructive readiness inspection route', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete app.locals.destructiveReadinessAssessor;
    delete app.locals.destructiveReadinessBasisBuilder;
    delete app.locals.mediaUploadRepository;
    delete app.locals.mediaStorageProviderFactory;
  });

  test('valid minimal targeting request returns assessor result without requiring readiness booleans', async () => {
    const payload = validPayload();
    const repository = mockReadOnlyRepository();
    app.locals.mediaUploadRepository = repository;

    const response = await request(app)
      .post('/api/admin/media/uploads/destructive-readiness/inspect')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(200);

    expect(response.body.data.assessment).toEqual({
      isValid: true,
      validationErrorCodes: [],
      basis: expect.any(Object),
      isEligible: false,
      blockingReasonCodes: expect.any(Array),
    });
    expect(repository.listFinalizedAssets).toHaveBeenCalledTimes(1);
    expect(repository.listCleanupDryRunCandidates).toHaveBeenCalledTimes(1);
  });

  test('malformed request input fails closed', async () => {
    app.locals.mediaUploadRepository = mockReadOnlyRepository();

    const response = await request(app)
      .post('/api/admin/media/uploads/destructive-readiness/inspect')
      .set('Authorization', `Bearer ${adminToken}`)
      .send([])
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('missing required fields fail closed', async () => {
    const payload = validPayload();
    delete payload.targetAssetUrls;
    app.locals.mediaUploadRepository = mockReadOnlyRepository();

    const response = await request(app)
      .post('/api/admin/media/uploads/destructive-readiness/inspect')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('unsupported extra fields fail closed', async () => {
    const payload = {
      ...validPayload(),
      unsupportedScope: 'all-media',
    };
    app.locals.mediaUploadRepository = mockReadOnlyRepository();

    const response = await request(app)
      .post('/api/admin/media/uploads/destructive-readiness/inspect')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('blocking conditions return ineligible result with read-only repository access only', async () => {
    const payload = validPayload();
    const repository = mockReadOnlyRepository({
      finalizedAssets: [{ url: 'https://cdn/a.jpg', isReferenced: true, referenceCount: 1 }],
      candidateAssets: [{ url: 'https://cdn/a.jpg' }],
    });
    const providerFactory = jest.fn();

    app.locals.mediaUploadRepository = repository;
    app.locals.mediaStorageProviderFactory = providerFactory;

    const response = await request(app)
      .post('/api/admin/media/uploads/destructive-readiness/inspect')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(200);

    expect(response.body.data.assessment.isEligible).toBe(false);
    expect(repository.listFinalizedAssets).toHaveBeenCalledTimes(1);
    expect(repository.listCleanupDryRunCandidates).toHaveBeenCalledTimes(1);
    expect(repository.createUploadSession).not.toHaveBeenCalled();
    expect(repository.finalizeUploadByIdempotency).not.toHaveBeenCalled();
    expect(repository.listOrphanedFinalizedAssets).not.toHaveBeenCalled();
    expect(providerFactory).not.toHaveBeenCalled();
  });

  test('route uses only assessor output shape and is deterministic', async () => {
    const payload = validPayload();
    app.locals.mediaUploadRepository = mockReadOnlyRepository();

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
    app.locals.mediaUploadRepository = mockReadOnlyRepository();

    await request(app)
      .post('/api/admin/media/uploads/destructive-readiness/inspect')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(200);

    expect(payload).toEqual(snapshot);
  });

  test('route wiring calls assessor without inventing/suppressing errors or blockers', async () => {
    const payload = validPayload();
    const repository = mockReadOnlyRepository();
    app.locals.mediaUploadRepository = repository;

    const assessorSpy = jest.fn((input) => assessDestructiveReadiness(input));
    app.locals.destructiveReadinessAssessor = assessorSpy;

    const response = await request(app)
      .post('/api/admin/media/uploads/destructive-readiness/inspect')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(200);

    expect(assessorSpy).toHaveBeenCalledTimes(1);
    expect(assessorSpy).toHaveBeenCalledWith(expect.objectContaining({
      hasDestructiveAuthorization: false,
      hasPolicyVersionDrift: true,
      isTargetScopeApproved: true,
    }));
    const assessorInput = assessorSpy.mock.calls[0][0];
    expect(response.body.data.assessment).toEqual(assessDestructiveReadiness(assessorInput));
  });
});
