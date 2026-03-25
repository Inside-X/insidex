const MEDIA_UPLOAD_PROVIDER_DISABLED = 'disabled';
const MEDIA_UPLOAD_PROVIDER_STUB = 'stub';

export const MEDIA_UPLOAD_PROVIDER_MODES = [
  MEDIA_UPLOAD_PROVIDER_STUB,
];

export const ALLOWED_MEDIA_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

export const MAX_MEDIA_UPLOAD_SIZE_BYTES = 10_485_760;

function parseBoolean(value) {
  if (value == null) return false;
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function isAbsoluteHttpUrl(value) {
  if (!value) return false;

  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function buildConfigError(message) {
  const error = new Error(message);
  error.statusCode = 500;
  error.code = 'MEDIA_UPLOAD_CONFIG_INVALID';
  return error;
}

function createDisabledMediaStorageProvider() {
  async function rejectDisabledOperation() {
    const error = new Error('Media uploads are disabled');
    error.statusCode = 503;
    error.code = 'MEDIA_UPLOADS_DISABLED';
    throw error;
  }

  return {
    mode: MEDIA_UPLOAD_PROVIDER_DISABLED,
    enabled: false,
    createUploadTarget: rejectDisabledOperation,
    finalizeUpload: rejectDisabledOperation,
  };
}

function createStubMediaStorageProvider(options = {}) {
  const {
    baseUrl,
    now,
    idGenerator,
  } = options;
  const nowFn = typeof now === 'function' ? now : () => Date.now();
  const generateId = typeof idGenerator === 'function' ? idGenerator : () => Math.random().toString(36).slice(2, 10);
  const normalizedBaseUrl = String(baseUrl).replace(/\/+$/, '');

  return {
    mode: MEDIA_UPLOAD_PROVIDER_STUB,
    enabled: true,
    async createUploadTarget({ mimeType }) {
      const uploadId = `ul_${generateId()}`;
      return {
        uploadId,
        uploadUrl: `${normalizedBaseUrl}/upload/${uploadId}`,
        expiresAt: new Date(nowFn() + (15 * 60 * 1000)).toISOString(),
        headers: {
          'content-type': mimeType,
        },
        constraints: {
          mimeType,
          maxSizeBytes: MAX_MEDIA_UPLOAD_SIZE_BYTES,
        },
      };
    },
    async finalizeUpload({
      mimeType,
      sizeBytes,
      width,
      height,
      checksumSha256,
    }) {
      const assetId = `ast_${generateId()}`;
      return {
        assetId,
        url: `${normalizedBaseUrl}/assets/${assetId}`,
        mimeType,
        sizeBytes,
        width,
        height,
        checksumSha256,
        createdAt: new Date(nowFn()).toISOString(),
      };
    },
  };
}

export function createMediaStorageProvider(options = {}) {
  const {
    env,
    now,
    idGenerator,
  } = options;
  const resolvedEnv = env ?? process.env;
  const uploadsEnabled = parseBoolean(resolvedEnv.MEDIA_UPLOADS_ENABLED);
  if (!uploadsEnabled) {
    return createDisabledMediaStorageProvider();
  }

  const provider = String(resolvedEnv.MEDIA_UPLOAD_PROVIDER || '').trim().toLowerCase();
  if (!MEDIA_UPLOAD_PROVIDER_MODES.includes(provider)) {
    throw buildConfigError('MEDIA_UPLOAD_PROVIDER must be one of: stub when MEDIA_UPLOADS_ENABLED=true');
  }

  if (!isAbsoluteHttpUrl(resolvedEnv.MEDIA_UPLOAD_BASE_URL)) {
    throw buildConfigError('MEDIA_UPLOAD_BASE_URL must be a valid absolute http(s) URL when MEDIA_UPLOADS_ENABLED=true and MEDIA_UPLOAD_PROVIDER=stub');
  }

  return createStubMediaStorageProvider({
    baseUrl: resolvedEnv.MEDIA_UPLOAD_BASE_URL,
    now,
    idGenerator,
  });
}

export default createMediaStorageProvider;
