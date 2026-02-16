process.env.JWT_ACCESS_SECRET = 'test-jwt-access-secret-1234567890ab';
process.env.JWT_ACCESS_ISSUER = 'insidex-auth';
process.env.JWT_ACCESS_AUDIENCE = 'insidex-api';
process.env.JWT_ACCESS_EXPIRY = '15m';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-1234567890a';
process.env.JWT_REFRESH_ISSUER = 'insidex-auth-refresh';
process.env.JWT_REFRESH_AUDIENCE = 'insidex-api-refresh';
process.env.JWT_REFRESH_EXPIRY = '30m';