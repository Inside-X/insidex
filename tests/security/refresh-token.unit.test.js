import { issueRefreshToken } from '../../src/security/refresh-token.js';

describe('refresh-token issuance', () => {
  test('returns misconfigured when required config keys are missing', () => {
    const result = issueRefreshToken({
      userId: 'user-1',
      env: {
        JWT_REFRESH_SECRET: '',
        JWT_REFRESH_ISSUER: '',
        JWT_REFRESH_AUDIENCE: '',
        JWT_REFRESH_EXPIRY: '',
      },
    });

    expect(result).toEqual({ ok: false, reason: 'misconfigured' });
  });

  test('returns misconfigured when expiry format is invalid', () => {
    const result = issueRefreshToken({
      userId: 'user-1',
      env: {
        JWT_REFRESH_SECRET: 'secret_refresh_token_1234567890123456',
        JWT_REFRESH_ISSUER: 'issuer',
        JWT_REFRESH_AUDIENCE: 'audience',
        JWT_REFRESH_EXPIRY: '15x',
      },
    });

    expect(result).toEqual({ ok: false, reason: 'misconfigured' });
  });

  test('issues token with deterministic session id and positive expiry timestamp', () => {
    const result = issueRefreshToken({
      userId: 'user-2',
      sessionId: 'session-fixed',
      env: {
        JWT_REFRESH_SECRET: 'secret_refresh_token_1234567890123456',
        JWT_REFRESH_ISSUER: 'issuer',
        JWT_REFRESH_AUDIENCE: 'audience',
        JWT_REFRESH_EXPIRY: '30m',
      },
    });

    expect(result.ok).toBe(true);
    expect(result.sessionId).toBe('session-fixed');
    expect(typeof result.token).toBe('string');
    expect(result.token.length).toBeGreaterThan(10);
    expect(result.expiresAt).toBeGreaterThan(Date.now());
  });
});