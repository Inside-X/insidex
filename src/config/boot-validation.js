import { getJwtConfigValidationErrors } from '../security/jwt-config.js';
import { logger } from '../utils/logger.js';

function parseBoolean(value) {
  if (value == null) return false;
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function parseCorsWhitelist(value) {
  return String(value || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function hasValidCorsOrigin(origin) {
  if (!origin || origin === '*') return false;

  try {
    const parsed = new URL(origin);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

export function validateBootConfig(env = process.env) {
  const errors = [];
  const paymentsEnabled = parseBoolean(env.PAYMENTS_ENABLED);
  const paypalEnabled = parseBoolean(env.PAYPAL_ENABLED);

  errors.push(...getJwtConfigValidationErrors(env));

  if (paymentsEnabled && !env.STRIPE_SECRET) {
    errors.push('STRIPE_SECRET is required when PAYMENTS_ENABLED=true');
  }

  if (!env.STRIPE_WEBHOOK_SECRET) {
    errors.push('STRIPE_WEBHOOK_SECRET is required');
  }

  if (!env.PAYMENT_WEBHOOK_SECRET) {
    errors.push('PAYMENT_WEBHOOK_SECRET is required');
  }

  if (paypalEnabled && !env.PAYPAL_CLIENT_SECRET) {
    errors.push('PAYPAL_CLIENT_SECRET is required when PAYPAL_ENABLED=true');
  }

  if (paypalEnabled && !env.PAYPAL_WEBHOOK_SECRET) {
    errors.push('PAYPAL_WEBHOOK_SECRET is required when PAYPAL_ENABLED=true');
  }

  if (!env.REDIS_URL) {
    errors.push('REDIS_URL is required for distributed rate limiting');
  }

  const corsOrigins = parseCorsWhitelist(env.CORS_ORIGIN);
  if (corsOrigins.length === 0) {
    errors.push('CORS_ORIGIN must define at least one origin');
  }

  for (const origin of corsOrigins) {
    if (!hasValidCorsOrigin(origin)) {
      errors.push(`CORS_ORIGIN contains an invalid origin: ${origin}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function assertBootConfigOrExit(env = process.env) {
  const result = validateBootConfig(env);
  if (result.valid) return;

  logger.error('boot_config_invalid', {
    errors: result.errors,
  });

  process.exit(1);
}

export function assertProductionBootConfigOrExit(env = process.env) {
  if (env.NODE_ENV !== 'production') return;
  assertBootConfigOrExit(env);
}

export default validateBootConfig;