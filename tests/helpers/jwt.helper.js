import jwt from 'jsonwebtoken';

export function buildTestToken({
  id = 'user-test-id',
  role = 'customer',
  expiresIn = '15m',
  secret = process.env.JWT_ACCESS_SECRET,
  issuer = process.env.JWT_ACCESS_ISSUER,
  audience = process.env.JWT_ACCESS_AUDIENCE,
} = {}) {
  const payload = {
    sub: id,
  };

  if (role !== undefined) {
    payload.role = role;
  }

  const signOptions = { expiresIn, algorithm: 'HS256' };

  if (issuer && audience) {
    signOptions.issuer = issuer;
    signOptions.audience = audience;
  }

  return jwt.sign(payload, secret, signOptions);
}