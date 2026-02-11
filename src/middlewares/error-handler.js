import { AppError } from '../errors/app-error.js';

function normalizePayload(err, req) {
  const isAppError = err instanceof AppError;
  const statusCode = isAppError ? err.statusCode : 500;
  const code = isAppError ? err.code : 'INTERNAL_ERROR';
  const message = isAppError ? err.message : 'Internal server error';
  const details = isAppError && Array.isArray(err.details) ? err.details : [];

  const error = { code, message, details };

  // Support futur requestId sans le rendre obligatoire.
  if (req?.requestId) {
    error.requestId = req.requestId;
  }

  return { statusCode, payload: { error } };
}

function shouldLog(statusCode) {
  return statusCode >= 500;
}

export default function errorHandler(err, req, res, _next) {
  const { statusCode, payload } = normalizePayload(err, req);

  // Logger côté serveur uniquement (jamais dans la réponse client).
  if (shouldLog(statusCode)) {
    console.error('[api-error]', {
      code: payload.error.code,
      message: payload.error.message,
      requestId: req?.requestId,
      details: payload.error.details,
      name: err?.name
    });
  }

  return res.status(statusCode).json(payload);
}