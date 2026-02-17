import crypto from 'crypto';

export function createStripeSignatureHeader(payload, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const rawBody = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const signedPayload = `${timestamp}.${rawBody}`;
  const signature = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');
  return `t=${timestamp},v1=${signature}`;
}