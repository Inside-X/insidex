import { test, expect } from '@playwright/test';

test('checkout: create-intent 503 then retry reuses same idempotency key (items only)', async ({ page }) => {
  const apiRequests = [];
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('/api/')) apiRequests.push({ method: req.method(), url });
  });

  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  const api404Responses = [];
  page.on('response', (response) => {
    if (api404Responses.length >= 5) return;
    const request = response.request();
    const url = response.url();
    if (response.status() === 404 && url.includes('/api/')) {
      api404Responses.push(`${request.method()} ${url}`);
    }
  });

  const cartResponseBodies = [];

  const calls = [];
  let firstKey = null;

  const cartItems = {
    prod_test_1: {
      id: 'prod_test_1',
      name: 'Produit test',
      qty: 1,
      price: '19.99',
    },
  };

  await page.route('**/data/site.json', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        brand: 'Insidex',
        baseline: 'Test',
        heroText: 'Test',
        ctaText: 'Test',
      }),
    });
  });

  await page.route('**/api/cart**', async (route, request) => {
    const { pathname } = new URL(request.url());
    if (pathname !== '/api/cart') {
      return route.fallback();
    }

    if (request.method() === 'GET') {
      cartResponseBodies.push({ items: cartItems });
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: cartItems }),
      });
    }
    if (request.method() === 'DELETE') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    }
    return route.fallback();
  });

  await page.route('**/api/analytics/events', async (route, request) => {
    if (request.method() !== 'POST') return route.fallback();
    return route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.route('**/api/payments/create-intent**', async (route, request) => {
    expect(request.method()).toBe('POST');

    const raw = request.postData() || '';
    const body = raw ? JSON.parse(raw) : null;
    const key = body && (body.idempotencyKey || body.idempotency_key);

    expect(key).toBeTruthy();
    expect(body).toBeTruthy();
    expect(Array.isArray(body.items)).toBe(true);

    for (const it of body.items) {
      expect(it).toEqual({ id: 'prod_test_1', quantity: 1 });
      expect(it.price).toBeUndefined();
    }

    calls.push({ key, body });

    if (calls.length === 1) {
      firstKey = key;
      await new Promise((r) => setTimeout(r, 800));
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'dependency_unavailable',
            reasonCode: 'redis_unavailable',
          },
        }),
      });
    }

    expect(key).toBe(firstKey);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: { clientSecret: 'cs_test_123', metadata: { orderId: 'CMD-E2E-TEST' } },
        meta: { guestSessionToken: 'guest_session_token_test' },
      }),
    });
  });

  await page.goto('/checkout.html');

  await page.waitForResponse(
    (resp) => resp.url().includes('/api/cart') && resp.request().method() === 'GET' && resp.status() === 200,
    { timeout: 5000 }
  );
  await expect.poll(() => cartResponseBodies.length, { timeout: 5000 }).toBeGreaterThan(0);

  await page.fill('#fullName', 'Test User');
  await page.fill('#addressLine', '1 Rue de Test');
  await page.fill('#postalCode', '97600');
  await page.fill('#city', 'Mamoudzou');
  await page.selectOption('#country', 'Mayotte');
  await page.fill('#email', 'test@example.com');
  await page.fill('#phone', '0700000000');
  await page.check('#termsAccepted');

  const payBtn = page.locator('#placeOrderBtn');
  await expect(payBtn).toBeVisible();
  await expect(payBtn).toBeEnabled();

  const reqPromise = page.waitForRequest('**/api/payments/create-intent**', { timeout: 5000 }).catch(() => null);

  await payBtn.click();

  const req = await reqPromise;
  if (!req) {
    throw new Error(
      [
        'No create-intent request observed after clicking pay button.',
        `pageErrors (first 2): ${pageErrors.slice(0, 2).join(' | ') || 'none'}`,
        `api404Responses (first 5): ${api404Responses.join(' ; ') || 'none'}`,
        `apiRequests (first 10): ${apiRequests.slice(0, 10).map((r) => `${r.method} ${r.url}`).join(' ; ') || 'none'}`,
      ].join('\n')
    );
  }

  await expect.poll(() => calls.length, { timeout: 5000 }).toBe(1);
  await expect(payBtn).toBeDisabled({ timeout: 5000 });

  const err = page.locator('#paymentStatus').getByText(/indisponible|réessayez|retry|unavailable/i);
  await expect(err).toBeVisible({ timeout: 5000 });

  const retryBtn = page.getByRole('button', { name: /réessayer|re-?try/i });
  await expect(retryBtn).toBeVisible();
  await retryBtn.click();

  await expect.poll(() => calls.length, { timeout: 5000 }).toBe(2);
  await expect
    .poll(() => calls.map((call) => call.key), { timeout: 5000 })
    .toEqual([firstKey, firstKey]);
});