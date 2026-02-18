import { jest } from '@jest/globals';

async function loadModule({ configOverride, signImpl } = {}) {
  jest.resetModules();

  const sign = jest.fn(signImpl || (() => 'signed.jwt.token'));
  const getAccessTokenConfig = jest.fn(() => ({
    secret: 'access-secret',
    issuer: 'insidex-api',
    audience: 'insidex-web',
    expiry: '15m',
    ...configOverride,
  }));

  await jest.unstable_mockModule('jsonwebtoken', () => ({
    default: { sign },
  }));

  await jest.unstable_mockModule('../../src/security/jwt-config.js', () => ({
    getAccessTokenConfig,
  }));

  const mod = await import('../../src/security/access-token.js');
  return {
    issueAccessToken: mod.issueAccessToken,
    sign,
    getAccessTokenConfig,
  };
}

describe('access-token issuer (security critical)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });


  test('supports empty invocation object defaults and still signs when config is valid', async () => {
    const { issueAccessToken, sign } = await loadModule();

    const token = issueAccessToken();

    expect(token).toBe('signed.jwt.token');
    expect(sign).toHaveBeenCalledWith(
      { sub: undefined, role: undefined, isGuest: false },
      'access-secret',
      expect.objectContaining({ expiresIn: '15m' }),
    );
  });

  test('issues token with valid claims and default expiry from config', async () => {
    const { issueAccessToken, sign, getAccessTokenConfig } = await loadModule();

    const token = issueAccessToken({ id: 'u-1', role: 'admin', isGuest: false });

    expect(token).toBe('signed.jwt.token');
    expect(getAccessTokenConfig).toHaveBeenCalledTimes(1);
    expect(sign).toHaveBeenCalledWith(
      { sub: 'u-1', role: 'admin', isGuest: false },
      'access-secret',
      {
        algorithm: 'HS256',
        expiresIn: '15m',
        issuer: 'insidex-api',
        audience: 'insidex-web',
      },
    );
  });

  test('uses caller-provided expiresIn override over configured expiry', async () => {
    const { issueAccessToken, sign } = await loadModule();

    issueAccessToken({ id: 'u-2', role: 'customer', isGuest: false, expiresIn: '60s' });

    expect(sign).toHaveBeenCalledWith(
      { sub: 'u-2', role: 'customer', isGuest: false },
      'access-secret',
      expect.objectContaining({ expiresIn: '60s' }),
    );
  });

  test('accepts valid guest token claims (role guest + isGuest true)', async () => {
    const { issueAccessToken, sign } = await loadModule();

    const token = issueAccessToken({ id: 'guest-1', role: 'guest', isGuest: true });

    expect(token).toBe('signed.jwt.token');
    expect(sign).toHaveBeenCalledTimes(1);
  });

  test('accepts guest role with whitespace/case normalization when isGuest is true', async () => {
    const { issueAccessToken, sign } = await loadModule();

    const token = issueAccessToken({ id: 'guest-2', role: '  GUEST  ', isGuest: true });

    expect(token).toBe('signed.jwt.token');
    expect(sign).toHaveBeenCalledWith(
      { sub: 'guest-2', role: '  GUEST  ', isGuest: true },
      'access-secret',
      expect.any(Object),
    );
  });

  test('throws GUEST_ISOLATION_VIOLATION when isGuest=true but role is not guest (role mismatch)', async () => {
    const { issueAccessToken, sign, getAccessTokenConfig } = await loadModule();

    expect(() => issueAccessToken({ id: 'u-3', role: 'customer', isGuest: true })).toThrow('Invalid guest token claims');

    try {
      issueAccessToken({ id: 'u-3', role: 'customer', isGuest: true });
    } catch (error) {
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('GUEST_ISOLATION_VIOLATION');
    }

    expect(getAccessTokenConfig).not.toHaveBeenCalled();
    expect(sign).not.toHaveBeenCalled();
  });

  test('throws GUEST_ISOLATION_VIOLATION when role=guest but isGuest is false/undefined', async () => {
    const { issueAccessToken, sign } = await loadModule();

    expect(() => issueAccessToken({ id: 'u-4', role: 'guest', isGuest: false })).toThrow('Invalid guest token claims');
    expect(() => issueAccessToken({ id: 'u-5', role: 'guest' })).toThrow('Invalid guest token claims');

    try {
      issueAccessToken({ id: 'u-4', role: 'guest', isGuest: false });
    } catch (error) {
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('GUEST_ISOLATION_VIOLATION');
    }

    expect(sign).not.toHaveBeenCalled();
  });

  test('throws JWT_MISCONFIGURED when secret is missing', async () => {
    const { issueAccessToken, sign } = await loadModule({ configOverride: { secret: '' } });

    expect(() => issueAccessToken({ id: 'u-6', role: 'admin' })).toThrow('JWT access token configuration is incomplete');

    try {
      issueAccessToken({ id: 'u-6', role: 'admin' });
    } catch (error) {
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('JWT_MISCONFIGURED');
    }

    expect(sign).not.toHaveBeenCalled();
  });

  test('throws JWT_MISCONFIGURED when issuer, audience, or expiry are missing', async () => {
    const missingIssuer = await loadModule({ configOverride: { issuer: '' } });
    expect(() => missingIssuer.issueAccessToken({ id: 'u-7', role: 'admin' })).toThrow('JWT access token configuration is incomplete');
    expect(missingIssuer.sign).not.toHaveBeenCalled();

    const missingAudience = await loadModule({ configOverride: { audience: null } });
    expect(() => missingAudience.issueAccessToken({ id: 'u-8', role: 'admin' })).toThrow('JWT access token configuration is incomplete');
    expect(missingAudience.sign).not.toHaveBeenCalled();

    const missingExpiry = await loadModule({ configOverride: { expiry: undefined } });
    expect(() => missingExpiry.issueAccessToken({ id: 'u-9', role: 'admin' })).toThrow('JWT access token configuration is incomplete');
    expect(missingExpiry.sign).not.toHaveBeenCalled();
  });

  test('invalid payload structures are passed through and sign errors propagate', async () => {
    const signError = new Error('jwt payload invalid');
    const { issueAccessToken, sign } = await loadModule({
      signImpl: () => {
        throw signError;
      },
    });

    expect(() => issueAccessToken({ id: undefined, role: null, isGuest: false })).toThrow(signError);
    expect(sign).toHaveBeenCalledWith(
      { sub: undefined, role: null, isGuest: false },
      'access-secret',
      expect.objectContaining({ algorithm: 'HS256' }),
    );
  });

  test('propagates jsonwebtoken signing errors (malformed/invalid signature style failures from library)', async () => {
    const signingFailure = Object.assign(new Error('invalid signature material'), { name: 'JsonWebTokenError' });
    const { issueAccessToken } = await loadModule({
      signImpl: () => {
        throw signingFailure;
      },
    });

    expect(() => issueAccessToken({ id: 'u-10', role: 'admin', isGuest: false })).toThrow('invalid signature material');
  });
});