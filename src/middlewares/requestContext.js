import crypto from 'crypto';

function resolveIncomingCorrelationId(req) {
  const existing = typeof req.correlationId === 'string' ? req.correlationId.trim() : '';
  if (existing) return existing;

  const headerCorrelation = req.get('x-correlation-id');
  if (typeof headerCorrelation === 'string' && headerCorrelation.trim()) {
    return headerCorrelation.trim();
  }

  const headerRequest = req.get('x-request-id');
  if (typeof headerRequest === 'string' && headerRequest.trim()) {
    return headerRequest.trim();
  }

  return crypto.randomUUID();
}

export function requestContext(req, res, next) {
  const correlationId = resolveIncomingCorrelationId(req);

  req.correlationId = correlationId;
  req.requestId = correlationId;
  res.set('x-correlation-id', correlationId);
  res.set('x-request-id', correlationId);

  return next();
}

export default requestContext;