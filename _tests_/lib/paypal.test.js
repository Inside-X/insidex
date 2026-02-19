import { jest } from '@jest/globals';

const fetchMock = jest.fn();
global.fetch = fetchMock;

const { default: paypal } = await import('../../src/lib/paypal.js');

describe('lib/paypal', () => {
  const env={...process.env};
  beforeEach(()=>{process.env={...env,PAYPAL_CLIENT_ID:'id',PAYPAL_SECRET:'sec',PAYPAL_WEBHOOK_ID:'wh'}; fetchMock.mockReset();});

  test('missing headers returns missing status', async () => {
    const r = await paypal.webhooks.verifyWebhookSignature({ getHeader:()=>null, webhookEvent:{} });
    expect(r).toEqual({ verified:false, verificationStatus:'MISSING_HEADERS', reason:'missing_verification_headers' });
  });

  test('missing env throws', async () => {
    delete process.env.PAYPAL_WEBHOOK_ID;
    await expect(paypal.webhooks.verifyWebhookSignature({ getHeader:()=> 'x', webhookEvent:{} })).rejects.toThrow('Missing required PayPal configuration');
  });

  test('token fetch not ok', async () => {
    fetchMock.mockResolvedValueOnce({ ok:false });
    await expect(paypal.webhooks.verifyWebhookSignature({ getHeader:()=> 'x', webhookEvent:{} })).rejects.toMatchObject({ statusCode:502 });
  });

  test('token payload missing access_token', async () => {
    fetchMock.mockResolvedValueOnce({ ok:true, json: async()=>({}) });
    await expect(paypal.webhooks.verifyWebhookSignature({ getHeader:()=> 'x', webhookEvent:{} })).rejects.toMatchObject({ statusCode:502 });
  });

  test('verification endpoint non-ok', async () => {
    fetchMock.mockResolvedValueOnce({ ok:true, json: async()=>({ access_token:'tok' }) }).mockResolvedValueOnce({ ok:false });
    const r = await paypal.webhooks.verifyWebhookSignature({ getHeader:()=> 'x', webhookEvent:{} });
    expect(r).toEqual({ verified:false, verificationStatus:'VERIFICATION_ENDPOINT_ERROR', reason:'verification_endpoint_error' });
  });

  test('verification success and non-success branches', async () => {
    fetchMock.mockResolvedValueOnce({ ok:true, json: async()=>({ access_token:'tok' }) }).mockResolvedValueOnce({ ok:true, json: async()=>({ verification_status:'SUCCESS' }) });
    await expect(paypal.webhooks.verifyWebhookSignature({ getHeader:()=> 'x', webhookEvent:{a:1} })).resolves.toEqual({ verified:true, verificationStatus:'SUCCESS', reason:'SUCCESS' });

    fetchMock.mockResolvedValueOnce({ ok:true, json: async()=>({ access_token:'tok' }) }).mockResolvedValueOnce({ ok:true, json: async()=>({}) });
    await expect(paypal.webhooks.verifyWebhookSignature({ getHeader:()=> 'x', webhookEvent:{a:1} })).resolves.toEqual({ verified:false, verificationStatus:'UNKNOWN', reason:'UNKNOWN' });
  });
});