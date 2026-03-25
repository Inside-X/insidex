import {
  ALLOWED_MEDIA_MIME_TYPES,
  MAX_MEDIA_UPLOAD_SIZE_BYTES,
  createMediaStorageProvider,
} from '../../src/lib/media-storage-provider.js';

describe('media storage provider abstraction', () => {
  test('createMediaStorageProvider supports no-args invocation (default options)', () => {
    const previousEnabled = process.env.MEDIA_UPLOADS_ENABLED;
    const previousProvider = process.env.MEDIA_UPLOAD_PROVIDER;

    process.env.MEDIA_UPLOADS_ENABLED = 'false';
    delete process.env.MEDIA_UPLOAD_PROVIDER;

    const provider = createMediaStorageProvider();
    expect(provider.enabled).toBe(false);
    expect(provider.mode).toBe('disabled');

    if (previousEnabled === undefined) {
      delete process.env.MEDIA_UPLOADS_ENABLED;
    } else {
      process.env.MEDIA_UPLOADS_ENABLED = previousEnabled;
    }

    if (previousProvider === undefined) {
      delete process.env.MEDIA_UPLOAD_PROVIDER;
    } else {
      process.env.MEDIA_UPLOAD_PROVIDER = previousProvider;
    }
  });

  test('createMediaStorageProvider uses default env fallback as disabled', () => {
    const provider = createMediaStorageProvider({
      env: {},
    });

    expect(provider.enabled).toBe(false);
    expect(provider.mode).toBe('disabled');
  });

  test('disabled mode remains safe and deterministic', async () => {
    const provider = createMediaStorageProvider({
      env: { MEDIA_UPLOADS_ENABLED: 'false' },
    });

    expect(provider.enabled).toBe(false);
    expect(provider.mode).toBe('disabled');

    await expect(provider.createUploadTarget({ mimeType: 'image/jpeg' })).rejects.toMatchObject({
      code: 'MEDIA_UPLOADS_DISABLED',
      statusCode: 503,
    });
  });

  test('enabled mode rejects invalid provider', () => {
    expect(() => createMediaStorageProvider({
      env: {
        MEDIA_UPLOADS_ENABLED: 'true',
        MEDIA_UPLOAD_PROVIDER: 'invalid-provider',
      },
    })).toThrow('MEDIA_UPLOAD_PROVIDER must be one of: stub when MEDIA_UPLOADS_ENABLED=true');
  });

  test('enabled mode rejects empty provider value', () => {
    expect(() => createMediaStorageProvider({
      env: {
        MEDIA_UPLOADS_ENABLED: 'true',
      },
    })).toThrow('MEDIA_UPLOAD_PROVIDER must be one of: stub when MEDIA_UPLOADS_ENABLED=true');
  });

  test('enabled mode rejects explicit empty-string provider value', () => {
    expect(() => createMediaStorageProvider({
      env: {
        MEDIA_UPLOADS_ENABLED: 'true',
        MEDIA_UPLOAD_PROVIDER: '',
      },
    })).toThrow('MEDIA_UPLOAD_PROVIDER must be one of: stub when MEDIA_UPLOADS_ENABLED=true');
  });

  test('enabled stub mode requires absolute base url', () => {
    expect(() => createMediaStorageProvider({
      env: {
        MEDIA_UPLOADS_ENABLED: 'true',
        MEDIA_UPLOAD_PROVIDER: 'stub',
        MEDIA_UPLOAD_BASE_URL: '/relative/path',
      },
    })).toThrow('MEDIA_UPLOAD_BASE_URL must be a valid absolute http(s) URL when MEDIA_UPLOADS_ENABLED=true and MEDIA_UPLOAD_PROVIDER=stub');
  });

  test('enabled stub mode rejects non-http protocols', () => {
    expect(() => createMediaStorageProvider({
      env: {
        MEDIA_UPLOADS_ENABLED: 'true',
        MEDIA_UPLOAD_PROVIDER: 'stub',
        MEDIA_UPLOAD_BASE_URL: 'ftp://uploads.example.com',
      },
    })).toThrow('MEDIA_UPLOAD_BASE_URL must be a valid absolute http(s) URL when MEDIA_UPLOADS_ENABLED=true and MEDIA_UPLOAD_PROVIDER=stub');
  });

  test('enabled stub mode rejects missing base url', () => {
    expect(() => createMediaStorageProvider({
      env: {
        MEDIA_UPLOADS_ENABLED: 'true',
        MEDIA_UPLOAD_PROVIDER: 'stub',
      },
    })).toThrow('MEDIA_UPLOAD_BASE_URL must be a valid absolute http(s) URL when MEDIA_UPLOADS_ENABLED=true and MEDIA_UPLOAD_PROVIDER=stub');
  });

  test('stub abstraction returns deterministic contract-shaped values', async () => {
    const provider = createMediaStorageProvider({
      env: {
        MEDIA_UPLOADS_ENABLED: 'true',
        MEDIA_UPLOAD_PROVIDER: 'stub',
        MEDIA_UPLOAD_BASE_URL: 'https://uploads.example.com',
      },
      now: () => Date.parse('2026-03-25T10:00:00.000Z'),
      idGenerator: () => 'deterministic',
    });

    const upload = await provider.createUploadTarget({ mimeType: 'image/webp' });
    expect(upload).toEqual({
      uploadId: 'ul_deterministic',
      uploadUrl: 'https://uploads.example.com/upload/ul_deterministic',
      expiresAt: '2026-03-25T10:15:00.000Z',
      headers: { 'content-type': 'image/webp' },
      constraints: {
        mimeType: 'image/webp',
        maxSizeBytes: MAX_MEDIA_UPLOAD_SIZE_BYTES,
      },
    });

    const asset = await provider.finalizeUpload({
      mimeType: ALLOWED_MEDIA_MIME_TYPES[0],
      sizeBytes: 734003,
      width: 1600,
      height: 1200,
      checksumSha256: 'abc123',
    });

    expect(asset).toEqual({
      assetId: 'ast_deterministic',
      url: 'https://uploads.example.com/assets/ast_deterministic',
      mimeType: 'image/jpeg',
      sizeBytes: 734003,
      width: 1600,
      height: 1200,
      checksumSha256: 'abc123',
      createdAt: '2026-03-25T10:00:00.000Z',
    });
  });

  test('stub abstraction works with default clock/id generators', async () => {
    const provider = createMediaStorageProvider({
      env: {
        MEDIA_UPLOADS_ENABLED: 'true',
        MEDIA_UPLOAD_PROVIDER: 'stub',
        MEDIA_UPLOAD_BASE_URL: 'https://uploads.example.com/',
      },
    });

    const upload = await provider.createUploadTarget({ mimeType: 'image/png' });
    expect(upload.uploadId).toMatch(/^ul_[a-z0-9]+$/);
    expect(upload.uploadUrl).toMatch(/^https:\/\/uploads\.example\.com\/upload\/ul_[a-z0-9]+$/);
    expect(upload.expiresAt).toEqual(expect.any(String));
  });
});
