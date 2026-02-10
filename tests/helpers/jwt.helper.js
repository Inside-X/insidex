import jwt from 'jsonwebtoken';

export function buildTestToken({
  id = 'user-test-id',
  role = 'customer',
  expiresIn = '15m',
  secret = process.env.JWT_ACCESS_SECRET,
} = {}) {
  const payload = {
    sub: id,
  };

  if (role !== undefined) {
    payload.role = role;
  }

  return jwt.sign(payload, secret, { expiresIn, algorithm: 'HS256' });
}