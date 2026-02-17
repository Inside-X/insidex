import jwt from 'jsonwebtoken';
import { issueAccessToken } from '../../src/security/access-token.js';
import { verifyAccessToken } from '../../src/security/token-verifier.js';

describe('JWT edge cases', () => {
  test('accepts valid token', () => {
    const token = issueAccessToken({ id: 'user-1', role: 'customer', expiresIn: '2m' });
    const result = verifyAccessToken(token);
    expect(result.ok).toBe(true);
  });

  test('rejects expired token', () => {
    const token = issueAccessToken({ id: 'user-1', role: 'customer', expiresIn: '-10s' });
    const result = verifyAccessToken(token);
    expect(result.ok).toBe(false);
  });

  test('rejects invalid signature', () => {
    const token = jwt.sign({ sub: 'user-1', role: 'customer' }, process.env.JWT_REFRESH_SECRET, {
      algorithm: 'HS256',
      issuer: process.env.JWT_ACCESS_ISSUER,
      audience: process.env.JWT_ACCESS_AUDIENCE,
      expiresIn: '2m',
    });

    expect(verifyAccessToken(token).ok).toBe(false);
  });

  test('rejects invalid algorithm', () => {
    const token = jwt.sign({ sub: 'user-1', role: 'customer' }, process.env.JWT_ACCESS_SECRET, {
      algorithm: 'HS384',
      issuer: process.env.JWT_ACCESS_ISSUER,
      audience: process.env.JWT_ACCESS_AUDIENCE,
      expiresIn: '2m',
    });

    expect(verifyAccessToken(token).ok).toBe(false);
  });

  test('rejects audience mismatch', () => {
    const token = jwt.sign({ sub: 'user-1', role: 'customer' }, process.env.JWT_ACCESS_SECRET, {
      algorithm: 'HS256',
      issuer: process.env.JWT_ACCESS_ISSUER,
      audience: 'wrong-aud',
      expiresIn: '2m',
    });

    expect(verifyAccessToken(token).ok).toBe(false);
  });

  test('rejects issuer mismatch', () => {
    const token = jwt.sign({ sub: 'user-1', role: 'customer' }, process.env.JWT_ACCESS_SECRET, {
      algorithm: 'HS256',
      issuer: 'wrong-issuer',
      audience: process.env.JWT_ACCESS_AUDIENCE,
      expiresIn: '2m',
    });

    expect(verifyAccessToken(token).ok).toBe(false);
  });

  test('rejects malformed token', () => {
    expect(verifyAccessToken('bad.token').ok).toBe(false);
  });

  test('returns misconfigured when secret absent', () => {
    const token = issueAccessToken({ id: 'user-1', role: 'customer', expiresIn: '2m' });
    const result = verifyAccessToken(token, {
      ...process.env,
      JWT_ACCESS_SECRET: '',
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('misconfigured');
  });
});