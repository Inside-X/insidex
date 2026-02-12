import { logger } from '../utils/logger.js';

export function requestLogger(req, res, next) {
  const startedAt = Date.now();

  res.on('finish', () => {
    const elapsedMs = Date.now() - startedAt;
    const entry = {
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