import crypto from 'node:crypto';
import stripe from '../../src/lib/stripe.js';

describe('lib/stripe', () => {
  function sigFor(body, secret, ts = Math.floor(Date.now() / 1000)) {
    const h = crypto.createHmac('sha256', secret).update(`${ts}.${body.toString('utf8')}`, 'utf8').digest('hex');
    return `t=${ts},v1=${h}`;
  }

  test('constructEvent success', () => {
    const raw = Buffer.from(JSON.stringify({ id: 'evt' }));
    const secret = 'sec';
    const sig = sigFor(raw, secret);
    expect(stripe.webhooks.constructEvent(raw, sig, secret)).toEqual({ id: 'evt' });
  });

  test('rejects malformed monetary content after JSON parse', () => {
    const secret = 'sec';
    const raw = Buffer.from(JSON.stringify({ payload: { capture: { amount: 10.5 } } }));
    const sig = sigFor(raw, secret);
    expect(() => stripe.webhooks.constructEvent(raw, sig, secret)).toThrow('Malformed webhook payload');
  });

  test('input validation and malformed payload/signature branches', () => {
    expect(() => stripe.webhooks.constructEvent('x', 'a', 's')).toThrow('Buffer');
    expect(() => stripe.webhooks.constructEvent(Buffer.from('{}'), 'a', '')).toThrow('Missing Stripe webhook secret');
    expect(() => stripe.webhooks.constructEvent(Buffer.from('{}'), '', 's')).toThrow('Missing stripe-signature header');
    const oldTs = 1;
    const raw = Buffer.from('{}');
    const sig = sigFor(raw, 's', oldTs);
    expect(() => stripe.webhooks.constructEvent(raw, sig, 's', { toleranceSeconds: 1 })).toThrow('outside tolerance');
    const sig2 = `t=${Math.floor(Date.now() / 1000)},v1=abc`;
    expect(() => stripe.webhooks.constructEvent(raw, sig2, 's')).toThrow('No signatures found matching');
    const rawBad = Buffer.from('{');
    const sigBad = sigFor(rawBad, 's');
    expect(() => stripe.webhooks.constructEvent(rawBad, sigBad, 's')).toThrow('Malformed webhook payload');
  });
});