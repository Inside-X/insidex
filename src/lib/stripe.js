import crypto from 'crypto';
import { parseJsonWithStrictMonetaryValidation } from '../utils/strict-monetary-json.js';

const DEFAULT_TOLERANCE_SECONDS = 300;

function parseStripeSignature(signatureHeader) {
  if (!signatureHeader || typeof signatureHeader !== 'string') {
    throw new Error('Missing stripe-signature header');
  }

  const parsed = new Map();

  for (const chunk of signatureHeader.split(',')) {
    const [key, value] = chunk.split('=', 2);
    if (!key || !value) continue;
    if (!parsed.has(key)) parsed.set(key, []);
    parsed.get(key).push(value);
  }

  return {
    timestamp: parsed.get('t')?.[0],
    signaturesV1: parsed.get('v1') || [],
  };
}

function assertTimestampWithinTolerance(timestamp, toleranceSeconds) {
  const parsedTimestamp = Number(timestamp);
  if (!Number.isFinite(parsedTimestamp)) {
    throw new Error('Invalid stripe signature timestamp');
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parsedTimestamp) > toleranceSeconds) {
    throw new Error('Stripe signature timestamp outside tolerance');
  }
}

function verifySignature({ rawBody, signature, secret, toleranceSeconds = DEFAULT_TOLERANCE_SECONDS }) {
  const { timestamp, signaturesV1 } = parseStripeSignature(signature);
  if (!timestamp || signaturesV1.length === 0) {
    throw new Error('No signatures found matching the expected scheme');
  }

  assertTimestampWithinTolerance(timestamp, toleranceSeconds);

  const payloadToSign = `${timestamp}.${rawBody.toString('utf8')}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payloadToSign, 'utf8')
    .digest('hex');

  const hasMatch = signaturesV1.some((candidate) => {
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const candidateBuffer = Buffer.from(candidate, 'utf8');

    if (expectedBuffer.length !== candidateBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, candidateBuffer);
  });

  if (!hasMatch) {
    throw new Error('No signatures found matching the expected signature for payload');
  }
}

function constructEvent(rawBody, signature, secret, options = {}) {
  if (!Buffer.isBuffer(rawBody)) {
    throw new Error('Webhook payload must be provided as a Buffer');
  }

  if (!secret) {
    throw new Error('Missing Stripe webhook secret');
  }

  verifySignature({
    rawBody,
    signature,
    secret,
    toleranceSeconds: options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS,
  });

  try {
    return parseJsonWithStrictMonetaryValidation(rawBody.toString('utf8'), 'webhook payload');
  } catch {
    throw new Error('Malformed webhook payload');
  }
}

export const stripe = {
  webhooks: {
    constructEvent,
  },
};

export default stripe;