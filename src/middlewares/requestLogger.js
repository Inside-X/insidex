import { logger } from '../utils/logger.js';

export function requestLogger(req, res, next) {
  const startedAt = Date.now();
  const correlationId = req.correlationId || req.requestId;

  logger.debug('http_request_started', {
    correlationId,
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
  });

  res.on('finish', () => {
    const elapsedMs = Date.now() - startedAt;
    const entry = {
      correlationId,
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      elapsedMs,
    };

    if (process.env.NODE_ENV === 'production' && res.statusCode < 400) {
      logger.info('http_request', entry);
      return;
    }

    if (res.statusCode >= 500) {
      logger.error('http_request_failed', entry);
      return;
    }

    logger.debug('http_request', entry);
  });

  return next();
}

export default requestLogger;