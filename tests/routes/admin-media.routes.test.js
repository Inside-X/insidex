import { jest } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import { buildTestToken } from '../helpers/jwt.helper.js';

const adminToken = buildTestToken({ role: 'admin', id: 'admin-media-1' });
const userToken = buildTestToken({ role: 'customer', id: 'admin-media-user-1' });

describe('admin media routes', () => {
  const previousEnv = {
    MEDIA_UPLOADS_ENABLED: process.env.MEDIA_UPLOADS_ENABLED,
    MEDIA_UPLOAD_PROVIDER: process.env.MEDIA_UPLOAD_PROVIDER,
    MEDIA_UPLOAD_BASE_URL: process.env.MEDIA_UPLOAD_BASE_URL,
  };

  function restoreEnv() {
    if (previousEnv.MEDIA_UPLOADS_ENABLED === undefined) delete process.env.MEDIA_UPLOADS_ENABLED;
    else process.env.MEDIA_UPLOADS_ENABLED = previousEnv.MEDIA_UPLOADS_ENABLED;

    if (previousEnv.MEDIA_UPLOAD_PROVIDER === undefined) delete process.env.MEDIA_UPLOAD_PROVIDER;
    else process.env.MEDIA_UPLOAD_PROVIDER = previousEnv.MEDIA_UPLOAD_PROVIDER;

    if (previousEnv.MEDIA_UPLOAD_BASE_URL === undefined) delete process.env.MEDIA_UPLOAD_BASE_URL;
    else process.env.MEDIA_UPLOAD_BASE_URL = previousEnv.MEDIA_UPLOAD_BASE_URL;
  }

  afterEach(() => {
    jest.restoreAllMocks();
    delete app.locals.mediaStorageProviderFactory;
    delete app.locals.mediaUploadRepository;
    restoreEnv();
  });

  test('upload-init success with valid payload persists upload session metadata', async () => {
    const createUploadTarget = jest.fn().mockResolvedValue({
      uploadId: 'ul_01H',
      uploadUrl: 'https://uploads.example.com/upload/ul_01H',
      expiresAt: '2026-03-25T12:00:00.000Z',
      headers: { 'content-type': 'image/jpeg' },
      constraints: { mimeType: 'image/jpeg', maxSizeBytes: 10_485_760 },
    });
    const createUploadSession = jest.fn().mockResolvedValue({ id: 'ul_01H' });

    app.locals.mediaStorageProviderFactory = () => ({
      createUploadTarget,
      finalizeUpload: jest.fn(),
    });
    app.locals.mediaUploadRepository = {
      createUploadSession,
      finalizeUploadByIdempotency: jest.fn(),
    };

    const payload = {
      filename: 'amani-chair-main.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 734003,
      sha256: 'abc123',
    };

    const response = await request(app)
      .post('/api/admin/media/uploads/init')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(200);

    expect(response.body.data.upload).toEqual({
      uploadId: 'ul_01H',
      uploadUrl: 'https://uploads.example.com/upload/ul_01H',
      expiresAt: '2026-03-25T12:00:00.000Z',
      headers: { 'content-type': 'image/jpeg' },
      constraints: { mimeType: 'image/jpeg', maxSizeBytes: 10_485_760 },
    });
    expect(createUploadTarget).toHaveBeenCalledWith(payload);
    expect(createUploadSession).toHaveBeenCalledWith({
      uploadId: 'ul_01H',
      filename: 'amani-chair-main.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 734003,
      sha256: 'abc123',
      uploadUrl: 'https://uploads.example.com/upload/ul_01H',
      expiresAt: '2026-03-25T12:00:00.000Z',
    });
  });

  test('upload-init invalid mime rejection', async () => {
    const response = await request(app)
      .post('/api/admin/media/uploads/init')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        filename: 'amani-chair-main.jpg',
        mimeType: 'image/gif',
        sizeBytes: 734003,
      })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'mimeType' }),
      ]),
    );
  });

  test('upload-init oversize rejection', async () => {
    const response = await request(app)
      .post('/api/admin/media/uploads/init')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        filename: 'amani-chair-main.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 10_485_761,
      })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'sizeBytes' }),
      ]),
    );
  });

  test('upload-init disabled provider path propagates through error stack', async () => {
    process.env.MEDIA_UPLOADS_ENABLED = 'false';
    delete process.env.MEDIA_UPLOAD_PROVIDER;
    delete process.env.MEDIA_UPLOAD_BASE_URL;

    const response = await request(app)
      .post('/api/admin/media/uploads/init')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        filename: 'amani-chair-main.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 734003,
      })
      .expect(503);

    expect(response.body.error.code).toBe('MEDIA_UPLOADS_DISABLED');
  });

  test('upload-init rejects unknown fields', async () => {
    const response = await request(app)
      .post('/api/admin/media/uploads/init')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        filename: 'amani-chair-main.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 734003,
        unknown: true,
      })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('upload-init requires authentication', async () => {
    await request(app)
      .post('/api/admin/media/uploads/init')
      .send({
        filename: 'amani-chair-main.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 734003,
      })
      .expect(401);
  });

  test('upload-init enforces admin permission', async () => {
    await request(app)
      .post('/api/admin/media/uploads/init')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        filename: 'amani-chair-main.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 734003,
      })
      .expect(403);
  });

  test('upload-finalize success with valid payload (persistence-aware)', async () => {
    const asset = {
      assetId: 'ast_01H',
      url: 'https://cdn.example.com/products/amani-chair/main.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 734003,
      width: 1600,
      height: 1200,
      checksumSha256: 'abc123',
      createdAt: '2026-03-25T12:00:10.000Z',
    };
    const finalizeUploadByIdempotency = jest.fn().mockResolvedValue(asset);

    app.locals.mediaStorageProviderFactory = () => ({
      createUploadTarget: jest.fn(),
      finalizeUpload: jest.fn(),
    });
    app.locals.mediaUploadRepository = {
      createUploadSession: jest.fn(),
      finalizeUploadByIdempotency,
    };

    const response = await request(app)
      .post('/api/admin/media/uploads/finalize')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        uploadId: 'ul_01H',
        idempotencyKey: 'adm-media-finalize-0001',
      })
      .expect(200);

    expect(response.body).toEqual({
      data: {
        asset,
      },
    });
    expect(finalizeUploadByIdempotency).toHaveBeenCalledWith({
      uploadId: 'ul_01H',
      idempotencyKey: 'adm-media-finalize-0001',
      finalizeWithProvider: expect.any(Function),
    });
  });

  test('upload-finalize executes finalizeWithProvider callback with session-derived payload', async () => {
    const finalizeUpload = jest.fn().mockResolvedValue({
      assetId: 'ast_01H',
      url: 'https://cdn.example.com/products/amani-chair/main.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 734003,
      width: 1600,
      height: 1200,
      checksumSha256: 'abc123',
      createdAt: '2026-03-25T12:00:10.000Z',
    });

    app.locals.mediaStorageProviderFactory = () => ({
      createUploadTarget: jest.fn(),
      finalizeUpload,
    });
    app.locals.mediaUploadRepository = {
      createUploadSession: jest.fn(),
      finalizeUploadByIdempotency: jest.fn().mockImplementation(async ({ finalizeWithProvider }) => finalizeWithProvider({
        id: 'ul_01H',
        mimeType: 'image/jpeg',
        sizeBytes: 734003,
        sha256: 'abc123',
      })),
    };

    await request(app)
      .post('/api/admin/media/uploads/finalize')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        uploadId: 'ul_01H',
        idempotencyKey: 'adm-media-finalize-0001',
      })
      .expect(200);

    expect(finalizeUpload).toHaveBeenCalledWith({
      uploadId: 'ul_01H',
      idempotencyKey: 'adm-media-finalize-0001',
      mimeType: 'image/jpeg',
      sizeBytes: 734003,
      checksumSha256: 'abc123',
      width: 0,
      height: 0,
    });
  });

  test('upload-finalize missing or invalid idempotencyKey rejection', async () => {
    const response = await request(app)
      .post('/api/admin/media/uploads/finalize')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        uploadId: 'ul_01H',
        idempotencyKey: '   ',
      })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'idempotencyKey' }),
      ]),
    );
  });

  test('upload-finalize rejects unknown fields', async () => {
    const response = await request(app)
      .post('/api/admin/media/uploads/finalize')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        uploadId: 'ul_01H',
        idempotencyKey: 'adm-media-finalize-0001',
        unknown: true,
      })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('upload-finalize disabled provider path propagates through error stack', async () => {
    const disabledError = new Error('Media uploads are disabled');
    disabledError.statusCode = 503;
    disabledError.code = 'MEDIA_UPLOADS_DISABLED';

    app.locals.mediaStorageProviderFactory = () => ({
      createUploadTarget: jest.fn(),
      finalizeUpload: jest.fn().mockRejectedValue(disabledError),
    });
    app.locals.mediaUploadRepository = {
      createUploadSession: jest.fn(),
      finalizeUploadByIdempotency: jest.fn().mockRejectedValue(disabledError),
    };

    const response = await request(app)
      .post('/api/admin/media/uploads/finalize')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        uploadId: 'ul_01H',
        idempotencyKey: 'adm-media-finalize-0001',
      })
      .expect(503);

    expect(response.body.error.code).toBe('MEDIA_UPLOADS_DISABLED');
  });

  test('upload-finalize repeated idempotencyKey returns same logical asset', async () => {
    const sameAsset = {
      assetId: 'ast_replay',
      url: 'https://cdn.example.com/products/amani-chair/replay.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 734003,
      width: 1600,
      height: 1200,
      checksumSha256: 'replay123',
      createdAt: '2026-03-25T12:00:10.000Z',
    };

    app.locals.mediaUploadRepository = {
      createUploadSession: jest.fn(),
      finalizeUploadByIdempotency: jest.fn()
        .mockResolvedValueOnce(sameAsset)
        .mockResolvedValueOnce(sameAsset),
    };
    app.locals.mediaStorageProviderFactory = () => ({
      createUploadTarget: jest.fn(),
      finalizeUpload: jest.fn(),
    });

    const payload = { uploadId: 'ul_01H', idempotencyKey: 'adm-media-finalize-0001' };

    const first = await request(app)
      .post('/api/admin/media/uploads/finalize')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(200);

    const second = await request(app)
      .post('/api/admin/media/uploads/finalize')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(200);

    expect(first.body).toEqual(second.body);
  });

  test('upload-finalize unknown uploadId propagates through existing error stack', async () => {
    const notFoundError = new Error('Database record not found');
    notFoundError.statusCode = 404;
    notFoundError.code = 'DB_RECORD_NOT_FOUND';

    app.locals.mediaUploadRepository = {
      createUploadSession: jest.fn(),
      finalizeUploadByIdempotency: jest.fn().mockRejectedValue(notFoundError),
    };
    app.locals.mediaStorageProviderFactory = () => ({
      createUploadTarget: jest.fn(),
      finalizeUpload: jest.fn(),
    });

    const response = await request(app)
      .post('/api/admin/media/uploads/finalize')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        uploadId: 'does-not-exist',
        idempotencyKey: 'adm-media-finalize-0001',
      })
      .expect(404);

    expect(response.body.error.code).toBe('DB_RECORD_NOT_FOUND');
  });

  test('upload-finalize requires authentication', async () => {
    await request(app)
      .post('/api/admin/media/uploads/finalize')
      .send({
        uploadId: 'ul_01H',
        idempotencyKey: 'adm-media-finalize-0001',
      })
      .expect(401);
  });

  test('upload-finalize enforces admin permission', async () => {
    await request(app)
      .post('/api/admin/media/uploads/finalize')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        uploadId: 'ul_01H',
        idempotencyKey: 'adm-media-finalize-0001',
      })
      .expect(403);
  });
});