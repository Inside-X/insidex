import crypto from 'crypto';

export function requestContext(req, res, next) {
  const incomingRequestId = req.get('x-request-id');
  const requestId = (typeof incomingRequestId === 'string' && incomingRequestId.trim()) || crypto.randomUUID();

  req.requestId = requestId;
  res.set('x-request-id', requestId);

  return next();
}

export default requestContext;