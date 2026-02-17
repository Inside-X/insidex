import { jest } from '@jest/globals';
import paypal from '../../src/lib/paypal.js';

describe('paypal library', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.PAYPAL_WEBHOOK_ID = 'WH-1';
    process.env.PAYPAL_CLIENT_ID = 'cid';
    process.env.PAYPAL_CLIENT_SECRET = 'csecret';
    process.env.PAYPAL_API_BASE_URL = 'https://paypal.local';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('verifyWebhookSignature returns false when required headers missing', async () => {
    const result = await paypal.webhooks.verifyWebhookSignature({
      getHeader: () => null,
      webhookEvent: { eventId: 'e1' },
    });

    expect(result.verified).toBe(false);
    expect(result.reason).toBe('missing_verification_headers');
  });

  test('verifyWebhookSignature returns true on SUCCESS response', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'token-1' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ verification_status: 'SUCCESS' }) });

    const result = await paypal.webhooks.verifyWebhookSignature({
      getHeader: (name) => ({
        'paypal-transmission-id': 'id-1',
        'paypal-transmission-time': 'time-1',
        'paypal-cert-url': 'https://cert',
        'paypal-auth-algo': 'algo',
        'paypal-transmission-sig': 'sig',
      }[name] || null),
      webhookEvent: { eventId: 'evt' },
    });

    expect(result).toEqual({ verified: true, reason: 'SUCCESS' });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});