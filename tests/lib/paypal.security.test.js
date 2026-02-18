import { jest } from '@jest/globals';
import paypal from '../../src/lib/paypal.js';

describe('paypal webhook security', () => {
  beforeEach(() => {
    process.env.PAYPAL_CLIENT_ID = 'client-id';
    process.env.PAYPAL_SECRET = 'client-secret';
    process.env.PAYPAL_WEBHOOK_ID = 'WH-1';
    process.env.PAYPAL_API_BASE_URL = 'https://paypal.example';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const headers = {
    'paypal-transmission-id': 'tx-1',
    'paypal-transmission-time': '2024-01-01T00:00:00Z',
    'paypal-cert-url': 'https://cert.example',
    'paypal-auth-algo': 'SHA256',
    'paypal-transmission-sig': 'sig-1',
  };

  test('verification success', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'token' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ verification_status: 'SUCCESS' }) });

    const result = await paypal.webhooks.verifyWebhookSignature({
      getHeader: (name) => headers[name],
      webhookEvent: { id: 'evt' },
    });

    expect(result).toEqual({ verified: true, verificationStatus: 'SUCCESS', reason: 'SUCCESS' });
  });

  test('verification fail', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'token' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ verification_status: 'FAILURE' }) });

    const result = await paypal.webhooks.verifyWebhookSignature({ getHeader: (n) => headers[n], webhookEvent: { id: 'evt' } });
    expect(result.verified).toBe(false);
  });

  test('api token error', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    await expect(paypal.webhooks.verifyWebhookSignature({ getHeader: (n) => headers[n], webhookEvent: { id: 'evt' } }))
      .rejects.toThrow(/unable to retrieve paypal access token/i);
  });

  test('invalid access token payload', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await expect(paypal.webhooks.verifyWebhookSignature({ getHeader: (n) => headers[n], webhookEvent: { id: 'evt' } }))
      .rejects.toThrow(/access token response is invalid/i);
  });

  test('missing env throws', async () => {
    delete process.env.PAYPAL_WEBHOOK_ID;
    await expect(paypal.webhooks.verifyWebhookSignature({ getHeader: (n) => headers[n], webhookEvent: { id: 'evt' } }))
      .rejects.toThrow(/PAYPAL_WEBHOOK_ID/i);
  });

  test('verification endpoint error returns explicit reason', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'token' }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) });

    const result = await paypal.webhooks.verifyWebhookSignature({ getHeader: (n) => headers[n], webhookEvent: { id: 'evt' } });
    expect(result).toEqual({ verified: false, verificationStatus: 'VERIFICATION_ENDPOINT_ERROR', reason: 'verification_endpoint_error' });
  });

  test('unknown verification status is returned', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'token' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    const result = await paypal.webhooks.verifyWebhookSignature({ getHeader: (n) => headers[n], webhookEvent: { id: 'evt' } });
    expect(result).toEqual({ verified: false, verificationStatus: 'UNKNOWN', reason: 'UNKNOWN' });
  });

  test('missing headers returns non-verified', async () => {
    const result = await paypal.webhooks.verifyWebhookSignature({ getHeader: () => undefined, webhookEvent: { id: 'evt' } });
    expect(result).toEqual({ verified: false, verificationStatus: 'MISSING_HEADERS', reason: 'missing_verification_headers' });
  });
});