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
    restoreEnv();
  });

  test('upload-init success with valid payload', async () => {
    process.env.MEDIA_UPLOADS_ENABLED = 'true';
    process.env.MEDIA_UPLOAD_PROVIDER = 'stub';
    process.env.MEDIA_UPLOAD_BASE_URL = 'https://uploads.example.com';

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
      uploadId: expect.stringMatching(/^ul_[a-z0-9]+$/),
      uploadUrl: expect.stringMatching(/^https:\/\/uploads\.example\.com\/upload\/ul_[a-z0-9]+$/),
      expiresAt: expect.any(String),
      headers: { 'content-type': 'image/jpeg' },
      constraints: { mimeType: 'image/jpeg', maxSizeBytes: 10_485_760 },
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
});
