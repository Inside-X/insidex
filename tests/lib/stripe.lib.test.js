import stripe from '../../src/lib/stripe.js';

describe('stripe library signature verification', () => {
  const secret = 'whsec_test_secret';


  async function signedHeader(payload, timestamp) {
    const { createHmac } = await import('crypto');
    const sig = createHmac('sha256', secret).update(`${timestamp}.${payload}`, 'utf8').digest('hex');
    return `t=${timestamp},v1=${sig}`;
  }

  test('constructEvent validates and parses payload', async () => {
    const raw = Buffer.from(JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded' }));
    const now = Math.floor(Date.now() / 1000);
    const signature = await signedHeader(raw.toString('utf8'), now);

    const event = stripe.webhooks.constructEvent(raw, signature, secret, { toleranceSeconds: 300, nowSeconds: now });
    expect(event.id).toBe('evt_1');
  });

  test('constructEvent rejects timestamp drift', async () => {
    const raw = Buffer.from(JSON.stringify({ id: 'evt_1' }));
    const timestamp = Math.floor(Date.now() / 1000) - 600;
    const signature = await signedHeader(raw.toString('utf8'), timestamp);

    expect(() => stripe.webhooks.constructEvent(raw, signature, secret, { toleranceSeconds: 300 })).toThrow('outside tolerance');
  });

  test('constructEvent rejects malformed signatures and non-buffer payloads', () => {
    expect(() => stripe.webhooks.constructEvent('raw-string', 't=1,v1=abc', secret)).toThrow('Buffer');
    expect(() => stripe.webhooks.constructEvent(Buffer.from('{}'), 'malformed-header', secret)).toThrow('No signatures found');
  });
});