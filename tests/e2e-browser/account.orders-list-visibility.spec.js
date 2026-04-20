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

  test('renders bounded order detail surface with loading, success, not-found and degraded states', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('insidex_access_token', 'access_token_for_orders_detail');
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
              orderId: 'ord_101',
              orderDate: '2026-04-19T09:00:00.000Z',
              status: { code: 'confirmed', label: 'Confirmed' },
              fulfillmentMode: { code: 'delivery_local', label: 'Local delivery' },
              itemSummary: { count: 1, text: 'Inside X Kit' },
              totalAmount: '149.90',
              currency: 'EUR',
              degraded: false,
            },
            {
              orderId: 'ord_404',
              orderDate: '2026-04-19T10:00:00.000Z',
              status: { code: 'pending_confirmation', label: 'Order received / pending confirmation' },
              fulfillmentMode: { code: 'pickup_local', label: 'Local pickup' },
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

    await page.route('**/api/orders/mine/ord_101', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            orderId: 'ord_101',
            orderDate: '2026-04-19T09:00:00.000Z',
            status: { code: 'ready', label: 'Ready for local delivery' },
            fulfillmentMode: { code: 'delivery_local', label: 'Local delivery' },
            payment: { code: 'payment_confirmed', label: 'Payment confirmed' },
            totals: { totalAmount: '149.90', currency: 'EUR' },
            items: [{ name: 'Inside X Kit', quantity: 1, lineTotal: '149.9' }],
            readiness: { label: 'Ready for local delivery' },
            completion: null,
            fulfillmentDetails: { modeNote: 'Delivery to 10 Rue du Port, 97600 Mamoudzou' },
            contextual: { degradedNotice: 'Some order details are currently limited.' },
            degraded: true,
          },
          meta: { degraded: true, message: 'Some order details are currently limited.' },
        }),
      });
    });

    await page.route('**/api/orders/mine/ord_404', async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Order not found' } }),
      });
    });

    await page.goto('/account.html');
    await expect(page.locator('#orderDetailSurface')).toContainText('Select an order to view details.');

    await page.getByRole('button', { name: 'View details' }).first().click();
    await expect(page.locator('#orderDetailSurface')).toContainText('Order ord_101');
    await expect(page.locator('#orderDetailSurface')).toContainText('Ready for local delivery');
    await expect(page.locator('#orderDetailSurface')).toContainText('Payment confirmed');
    await expect(page.locator('#orderDetailSurface')).toContainText('Some order details are currently limited.');

    await page.getByRole('button', { name: 'View details' }).nth(1).click();
    await expect(page.locator('#orderDetailSurface')).toContainText('We couldn’t find this order in your account.');

    await page.unroute('**/api/orders/mine/ord_101');
    await page.route('**/api/orders/mine/ord_101', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Order details unavailable' } }),
      });
    });

    await page.getByRole('button', { name: 'View details' }).first().click();
    await expect(page.locator('#orderDetailSurface')).toContainText('Unable to load this order right now.');
  });
});
