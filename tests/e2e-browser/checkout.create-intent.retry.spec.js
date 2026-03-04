import { test, expect } from '@playwright/test';

test('checkout: create-intent 503 then retry reuses same idempotency key (items only)', async ({ page }) => {
  const apiRequests = []; // capture all /api calls for deterministic debugging
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('/api/')) apiRequests.push({ method: req.method(), url });
  });

  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  const calls = [];
  let firstKey = null;

  const items = [{ id: 'prod_test_1', quantity: 1 }];

  // Mock cart to avoid Redis / fail-closed 503
  await page.route('**/api/cart**', async (route, request) => {
    if (request.method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items, cart: { items } }),
    });
  });

  // Optional: if checkout calls /api/orders BEFORE create-intent, make it deterministic
  await page.route('**/api/orders**', async (route, request) => {
    // Only mock if it's called; otherwise harmless.
    if (request.method() !== 'POST') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, orderId: 'order_test_123' }),
    });
  });

  // Mock create-intent with delay (in-flight window) then 503 then 200
  await page.route('**/api/payments/create-intent**', async (route, request) => {
    expect(request.method()).toBe('POST');

    const headers = request.headers();
    const raw = request.postData() || '';
    const body = raw ? JSON.parse(raw) : null;

    const headerKey =
      headers['idempotency-key'] ||
      headers['Idempotency-Key'] ||
      headers['x-idempotency-key'] ||
      headers['x-idempotency'];
    const bodyKey = body && (body.idempotencyKey || body.idempotency_key);
    const key = headerKey || bodyKey;

    expect(key).toBeTruthy();
    expect(body).toBeTruthy();
    expect(Array.isArray(body.items)).toBe(true);

    for (const it of body.items) {
      expect(it).toHaveProperty('id');
      expect(it).toHaveProperty('quantity');
      expect(it.price).toBeUndefined();
      expect(it.amount).toBeUndefined();
      expect(it.total).toBeUndefined();
      expect(it.unitPrice).toBeUndefined();
      expect(it.unit_price).toBeUndefined();
    }

    calls.push({ key, body });

    if (calls.length === 1) {
      firstKey = key;
      await new Promise((r) => setTimeout(r, 800));
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'critical_dependency_unavailable',
          reasonCode: 'redis_unavailable',
        }),
      });
    }

    expect(key).toBe(firstKey);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, paymentIntentId: 'pi_test_123', clientSecret: 'cs_test_123' }),
    });
  });

  await page.goto('/checkout.html');

  // Fill any required fields to avoid HTML5 validation blocking submit
  await page.evaluate(() => {
    const fire = (el) => {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };

    document.querySelectorAll('input[required], textarea[required]').forEach((el) => {
      if (el.tagName.toLowerCase() === 'textarea') {
        el.value = 'test';
        fire(el);
        return;
      }
      const t = (el.getAttribute('type') || '').toLowerCase();
      if (t === 'email') el.value = 'test@example.com';
      else if (t === 'tel') el.value = '0700000000';
      else if (t === 'number') el.value = '1';
      else el.value = 'test';
      fire(el);
    });

    document.querySelectorAll('select[required]').forEach((sel) => {
      if (sel.options && sel.options.length > 1) {
        sel.value = sel.options[1].value;
        fire(sel);
      }
    });
  });

  const payBtn = page.locator('#placeOrderBtn').first().or(page.locator('button[type="submit"]').first());
  await expect(payBtn).toBeVisible();

  // Wait for create-intent request (strong signal). If it doesn't happen, fail with evidence.
  const reqPromise = page.waitForRequest('**/api/payments/create-intent**', { timeout: 5000 }).catch(() => null);

  await payBtn.click();

  const req = await reqPromise;
  if (!req) {
    // Hard fail with deterministic evidence (why no create-intent)
    throw new Error(
      [
        'No create-intent request observed after clicking pay button.',
        `pageErrors: ${pageErrors.slice(0, 2).join(' | ') || 'none'}`,
        `apiRequests (first 12): ${apiRequests.slice(0, 12).map((r) => `${r.method} ${r.url}`).join(' ; ') || 'none'}`,
      ].join('\n')
    );
  }

  // Now we know it was called; calls[] should have 1 shortly after
  await expect.poll(() => calls.length, { timeout: 5000 }).toBe(1);

  // In-flight button disabled evidence (during forced delay)
  await expect(payBtn).toBeDisabled({ timeout: 5000 });

  // 503 UX + Retry
  const err = page.locator('text=/indisponible|réessayer|retry|unavailable|503/i').first();
  await expect(err).toBeVisible({ timeout: 5000 });

  const retryBtn = page
    .locator('#retryPaymentBtn')
    .first()
    .or(page.locator('button:has-text("Retry")').first())
    .or(page.locator('button:has-text("Réessayer")').first());

  await expect(retryBtn).toBeVisible();
  await retryBtn.click();

  await expect.poll(() => calls.length, { timeout: 5000 }).toBe(2);
});