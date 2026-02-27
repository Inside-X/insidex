import { AppError } from '../errors/app-error.js';
import { logger } from '../utils/logger.js';

function resolveStatusCode(err, isAppError) {
  if (isAppError) return err.statusCode;

  if (typeof err?.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 600) {
    return err.statusCode;
  }

  if (typeof err?.status === 'number' && err.status >= 400 && err.status < 600) {
    return err.status;
  }
  
  return 500;
}

function normalizePayload(err, req) {
  const isAppError = err instanceof AppError;
  const statusCode = resolveStatusCode(err, isAppError);
  const isProduction = process.env.NODE_ENV === 'production';
  const code = isAppError ? err.code : (err?.code || 'INTERNAL_ERROR');

  let message = 'Internal server error';
  if (isAppError) {
    message = err.message;
  } else if (statusCode < 500) {
    message = err?.message || 'Request failed';
  } else if (!isProduction) {
    message = err?.message || 'Internal server error';
  }

  const details = isAppError && Array.isArray(err.details) ? err.details : [];
  const error = { code, message, details };

  if (!isProduction && !isAppError && err?.stack) {
    error.stack = err.stack;
  }

  if (req?.requestId) {
    error.requestId = req.requestId;
  }

  return { statusCode, payload: { error } };
}

function resolveLogLevel(statusCode) {
  return statusCode >= 500 ? 'error' : 'warn';
}

export default function errorHandler(err, req, res, _next) {
  const { statusCode, payload } = normalizePayload(err, req);
  const level = resolveLogLevel(statusCode);
  const correlationId = req?.correlationId || req?.requestId;

  logger[level]('api_error', {
    code: payload.error.code,
    message: payload.error.message,
    correlationId,
    requestId: req?.requestId,
    details: payload.error.details,
    name: err?.name,
    stack: process.env.NODE_ENV === 'production' ? undefined : err?.stack,
  });

  return res.status(statusCode).json(payload);
}