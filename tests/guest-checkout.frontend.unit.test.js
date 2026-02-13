import { jest } from '@jest/globals';
import {
  buildCheckoutPayload,
  confirmStripePayment,
  createPaymentIntent,
  generateIdempotencyKey,
  storeGuestSession,
} from '../js/modules/guestCheckoutApi.js';

describe('guest checkout frontend api helpers', () => {
  beforeEach(() => {
    global.localStorage = {
      _s: new Map(),
      setItem(k, v) { this._s.set(k, String(v)); },
      getItem(k) { return this._s.get(k) || null; },
      removeItem(k) { this._s.delete(k); },
    };
    global.document = {
      dispatchEvent: jest.fn(),
    };
    global.CustomEvent = class CustomEvent {
      constructor(name, payload) {
        this.type = name;
        this.detail = payload?.detail;
      }
    };
  });

  test('builds strict checkout payload + idempotency key', () => {
    const key = generateIdempotencyKey();
    expect(key).toContain('checkout_');

    const payload = buildCheckoutPayload({
      email: 'guest@x.com',
      address: { line1: 'a', city: 'c', postalCode: '1', country: 'FR' },
      items: [{ id: 'p1', quantity: 1, price: 10 }],
      idempotencyKey: key,
    });

    expect(payload.idempotencyKey).toBe(key);
    expect(payload.email).toBe('guest@x.com');
  });

  test('stores guest jwt session emitted by backend', () => {
    storeGuestSession({ guestSessionToken: 'jwt_guest_token' }, 'guest@x.com');

    expect(localStorage.getItem('insidex_access_token')).toBe('jwt_guest_token');
    const user = JSON.parse(localStorage.getItem('insidex_auth_user'));
    expect(user.role).toBe('customer');
    expect(user.isGuest).toBe(true);
    expect(document.dispatchEvent).toHaveBeenCalled();
  });

  test('creates payment intent with bearer token', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { clientSecret: 'cs_123' } }),
    });

    const response = await createPaymentIntent({ idempotencyKey: 'idem_123' }, 'jwt_123');

    expect(response.data.clientSecret).toBe('cs_123');
    expect(fetch).toHaveBeenCalledWith('/api/payments/create-intent', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer jwt_123' }),
    }));
  });

  test('confirms stripe payment through sdk when available', async () => {
    global.window = {
      INSIDEX_STRIPE_PUBLIC_KEY: 'pk_test_x',
      Stripe: jest.fn(() => ({
        confirmCardPayment: jest.fn().mockResolvedValue({ paymentIntent: { id: 'pi_1' } }),
      })),
    };

    const result = await confirmStripePayment({ clientSecret: 'cs_x', testOutcome: 'success' });
    expect(result.ok).toBe(true);
  });
});