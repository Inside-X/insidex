import { test, expect } from '@playwright/test';

async function postOrderFromBrowser(page, payload) {
  return page.evaluate(async (body) => {
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const json = await response.json().catch(() => ({}));
    return { status: response.status, body: json };
  }, payload);
}

test('orders seam fails closed for invalid mode-aware fulfillment payloads', async ({ page }) => {
  await page.goto('/checkout.html');

  const base = {
    idempotencyKey: 'idem-browser-b47a-12345',
    email: 'browser@insidex.test',
    items: [{ id: '00000000-0000-0000-0000-000000000999', quantity: 1 }],
    address: {
      line1: '12 rue du Port',
      city: 'Mamoudzou',
      postalCode: '97600',
      country: 'FR',
    },
  };

  const missingFulfillment = await postOrderFromBrowser(page, {
    ...base,
    idempotencyKey: 'idem-browser-b47a-missing-fulfillment',
  });
  expect(missingFulfillment.status).toBe(400);
  expect(missingFulfillment.body?.error?.code).toBe('VALIDATION_ERROR');

  const mixedPickupDeliveryPayload = await postOrderFromBrowser(page, {
    ...base,
    idempotencyKey: 'idem-browser-b47a-mixed-payload',
    fulfillment: {
      mode: 'pickup_local',
      delivery: {
        destination: {
          line1: '12 rue du Port',
          city: 'Mamoudzou',
          postalCode: '97600',
          country: 'FR',
        },
      },
    },
  });
  expect(mixedPickupDeliveryPayload.status).toBe(400);
  expect(mixedPickupDeliveryPayload.body?.error?.code).toBe('VALIDATION_ERROR');

  const deliveryWithoutDestination = await postOrderFromBrowser(page, {
    ...base,
    idempotencyKey: 'idem-browser-b47a-no-destination',
    address: undefined,
    fulfillment: {
      mode: 'delivery_local',
    },
  });

  expect(deliveryWithoutDestination.status).toBe(400);
  expect(deliveryWithoutDestination.body?.error?.code).toBe('VALIDATION_ERROR');
});
