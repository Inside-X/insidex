import jwt from 'jsonwebtoken';

export function buildTestToken({
  id = 'user-test-id',
  role = 'customer',
  expiresIn = '15m',
  secret = process.env.JWT_ACCESS_SECRET,
} = {}) {
  return jwt.sign(
    {
      sub: id,
      role,
    },
    secret,
    { expiresIn },
  );
}