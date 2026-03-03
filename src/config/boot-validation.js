import { getJwtConfigValidationErrors } from '../security/jwt-config.js';
import { logger } from '../utils/logger.js';

function isProduction(env = process.env) {
  return env.NODE_ENV === 'production';
}

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

function resolvePaymentsProvider(env = process.env) {
  const provider = String(env.PAYMENTS_PROVIDER || 'stripe').trim().toLowerCase();
  if (!['stripe', 'paypal', 'both'].includes(provider)) {
    return null;
  }

  return provider;
}

function validatePaymentsConfig(env, errors) {
  const paymentsEnabled = parseBoolean(env.PAYMENTS_ENABLED);
  if (!paymentsEnabled) return;

  const provider = resolvePaymentsProvider(env);
  if (!provider) {
    errors.push('PAYMENTS_PROVIDER must be one of: stripe, paypal, both when PAYMENTS_ENABLED=true');
    return;
  }

  if (!env.PAYMENT_WEBHOOK_SECRET) {
    errors.push('PAYMENT_WEBHOOK_SECRET is required when PAYMENTS_ENABLED=true');
  }

  if ((provider === 'stripe' || provider === 'both') && !env.STRIPE_SECRET) {
    errors.push(`STRIPE_SECRET is required when PAYMENTS_ENABLED=true and PAYMENTS_PROVIDER=${provider}`);
  }

  if (provider === 'paypal' || provider === 'both') {
    if (!env.PAYPAL_SECRET) {
      errors.push(`PAYPAL_SECRET is required when PAYMENTS_ENABLED=true and PAYMENTS_PROVIDER=${provider}`);
    }
    if (!env.PAYPAL_CLIENT_ID) {
      errors.push(`PAYPAL_CLIENT_ID is required when PAYMENTS_ENABLED=true and PAYMENTS_PROVIDER=${provider}`);
    }
    if (!env.PAYPAL_WEBHOOK_ID) {
      errors.push(`PAYPAL_WEBHOOK_ID is required when PAYMENTS_ENABLED=true and PAYMENTS_PROVIDER=${provider}`);
    }
  }
}

export function validateBootConfig(env = process.env) {
  const errors = [];

  errors.push(...getJwtConfigValidationErrors(env));

  validatePaymentsConfig(env, errors);

  if (!env.REDIS_URL) {
    errors.push('REDIS_URL is required');
  }

  if (!env.JWT_SECRET) {
    errors.push('JWT_SECRET is required');
  }
  
  if (!env.DATABASE_URL) {
    errors.push('DATABASE_URL is required');
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

export function assertProductionBootConfigOrExit(env = process.env) {
  if (!isProduction(env)) return;

  const result = validateBootConfig(env);
  if (result.valid) return;

  logger.error('boot_config_invalid', {
    errors: result.errors,
  });

  process.exit(1);
}

export default validateBootConfig;