import { test, expect } from '@playwright/test';

test.describe('customer orders-list visibility seam', () => {
  test('shows sign-in prompt when no access token is present', async ({ page }) => {
    await page.goto('/account.html');
    await expect(page.locator('#ordersList')).toContainText('Sign in to view your order history.');
  });

  test('renders customer-safe order list with coherent primary fields', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('insidex_access_token', 'access_token_for_orders_list');
      localStorage.setItem('insidex_last_account_email', 'customer@insidex.test');
      localStorage.setItem('insidex_auth_user', JSON.stringify({ email: 'customer@insidex.test', role: 'customer' }));
    });

    await page.route('**/api/orders/mine?limit=20', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              orderId: 'ord_001',
              orderDate: '2026-04-17T10:00:00.000Z',
              status: { code: 'ready', label: 'Ready for pickup' },
              fulfillmentMode: { code: 'pickup_local', label: 'Local pickup' },
              itemSummary: { count: 2, text: 'Inside X Kit + 1 more' },
              totalAmount: '149.90',
              currency: 'EUR',
              degraded: false,
            },
            {
              orderId: 'ord_002',
              orderDate: '2026-04-18T08:30:00.000Z',
              status: { code: 'confirmed', label: 'Confirmed' },
              fulfillmentMode: { code: 'delivery_local', label: 'Local delivery' },
              itemSummary: { count: 1, text: 'Flow Sensor' },
              totalAmount: '79.90',
              currency: 'EUR',
              degraded: false,
            },
          ],
          meta: { count: 2 },
        }),
      });
    });

    await page.goto('/account.html');

    await expect(page.locator('#ordersList')).toContainText('Order ord_001');
    await expect(page.locator('#ordersList')).toContainText('Ready for pickup');
    await expect(page.locator('#ordersList')).toContainText('Local pickup');
    await expect(page.locator('#ordersList')).toContainText('Inside X Kit + 1 more');
    await expect(page.locator('#ordersList')).toContainText('Order ord_002');
    await expect(page.locator('#ordersList')).toContainText('Confirmed');
    await expect(page.locator('#ordersList')).toContainText('Local delivery');

    const rendered = await page.locator('#ordersList').innerText();
    expect(rendered).not.toContain('ready_for_pickup');
    expect(rendered).not.toContain('delivered_local');
    expect(rendered).not.toContain('shipped');
  });

  test('shows calm empty and error states', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('insidex_access_token', 'access_token_for_orders_list');
      localStorage.setItem('insidex_last_account_email', 'customer@insidex.test');
      localStorage.setItem('insidex_auth_user', JSON.stringify({ email: 'customer@insidex.test', role: 'customer' }));
    });

    await page.route('**/api/orders/mine?limit=20', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], meta: { count: 0 } }),
      });
    });

    await page.goto('/account.html');
    await expect(page.locator('#ordersList')).toContainText('Vous n’avez pas encore de commande.');

    await page.unroute('**/api/orders/mine?limit=20');
    await page.route('**/api/orders/mine?limit=20', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Order history unavailable' } }),
      });
    });

    await page.reload();
    await expect(page.locator('#ordersList')).toContainText('Unable to load your order history right now.');
  });
});
