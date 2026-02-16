const MIN_SECRET_LENGTH = 32;

function readRequiredEnv(env, key) {
  const value = env[key];
  if (typeof value !== 'string') return null;

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function buildTokenConfig(env, prefix) {
  return {
    secret: readRequiredEnv(env, `${prefix}_SECRET`),
    issuer: readRequiredEnv(env, `${prefix}_ISSUER`),
    audience: readRequiredEnv(env, `${prefix}_AUDIENCE`),
    expiry: readRequiredEnv(env, `${prefix}_EXPIRY`),
  };
}

function getMissingTokenConfigFields(config) {
  const missing = [];

  if (!config.secret) missing.push('SECRET');
  if (!config.issuer) missing.push('ISSUER');
  if (!config.audience) missing.push('AUDIENCE');
  if (!config.expiry) missing.push('EXPIRY');

  return missing;
}

function getSecretLengthError(configName, secret) {
  if (!secret || secret.length >= MIN_SECRET_LENGTH) return null;

  return `${configName}_SECRET must be at least ${MIN_SECRET_LENGTH} characters`;
}

export function getAccessTokenConfig(env = process.env) {
  return buildTokenConfig(env, 'JWT_ACCESS');
}

export function getRefreshTokenConfig(env = process.env) {
  return buildTokenConfig(env, 'JWT_REFRESH');
}

export function getJwtConfigValidationErrors(env = process.env) {
  const errors = [];
  const accessConfig = getAccessTokenConfig(env);
  const refreshConfig = getRefreshTokenConfig(env);

  for (const field of getMissingTokenConfigFields(accessConfig)) {
    errors.push(`JWT_ACCESS_${field} is required`);
  }

  for (const field of getMissingTokenConfigFields(refreshConfig)) {
    errors.push(`JWT_REFRESH_${field} is required`);
  }

  const accessSecretError = getSecretLengthError('JWT_ACCESS', accessConfig.secret);
  if (accessSecretError) errors.push(accessSecretError);

  const refreshSecretError = getSecretLengthError('JWT_REFRESH', refreshConfig.secret);
  if (refreshSecretError) errors.push(refreshSecretError);

  return errors;
}

export const jwtConfigUtils = {
  MIN_SECRET_LENGTH,
};
