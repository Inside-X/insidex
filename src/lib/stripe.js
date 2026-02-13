import crypto from 'crypto';

function parseStripeSignature(signatureHeader) {
  const parsed = new Map();

  for (const chunk of signatureHeader.split(',')) {
    const [key, value] = chunk.split('=', 2);
    if (!key || !value) continue;
    if (!parsed.has(key)) {
      parsed.set(key, []);
    }
    parsed.get(key).push(value);
  }

  return {
    timestamp: parsed.get('t')?.[0],
    signaturesV1: parsed.get('v1') || [],
  };
}

function verifySignature({ rawBody, signature, secret }) {
  const { timestamp, signaturesV1 } = parseStripeSignature(signature);
  if (!timestamp || signaturesV1.length === 0) {
    throw new Error('No signatures found matching the expected scheme');
  }

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

function constructEvent(rawBody, signature, secret) {
  if (!Buffer.isBuffer(rawBody)) {
    throw new Error('Webhook payload must be provided as a Buffer');
  }

  verifySignature({ rawBody, signature, secret });
  return JSON.parse(rawBody.toString('utf8'));
}

export const stripe = {
  webhooks: {
    constructEvent,
  },
};

export default stripe;