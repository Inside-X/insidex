import { test, expect } from '@jest/globals';

import {
  authSchemas,
  registerSchema,
  loginSchema,
  productsSchemas,
  createProductSchema,
  cartSchemas,
  addToCartSchema,
  leadsSchemas,
  createLeadSchema,
  ordersSchemas,
  analyticsSchemas,
  paymentsSchemas,
} from '../../src/validation/schemas/index.js';
import * as authModule from '../../src/validation/schemas/auth.schema.js';
import * as productModule from '../../src/validation/schemas/products.schema.js';
import * as cartModule from '../../src/validation/schemas/cart.schema.js';
import * as leadsModule from '../../src/validation/schemas/leads.schema.js';
import * as ordersModule from '../../src/validation/schemas/orders.schema.js';
import * as analyticsModule from '../../src/validation/schemas/analytics.schema.js';
import * as paymentsModule from '../../src/validation/schemas/payments.schema.js';

test('schema index exports expected stable surface with referentially consistent re-exports', () => {
  expect(authSchemas).toBe(authModule.authSchemas);
  expect(registerSchema).toBe(authModule.registerSchema);
  expect(loginSchema).toBe(authModule.loginSchema);

  expect(productsSchemas).toBe(productModule.productsSchemas);
  expect(createProductSchema).toBe(productModule.createProductSchema);

  expect(cartSchemas).toBe(cartModule.cartSchemas);
  expect(addToCartSchema).toBe(cartModule.addToCartSchema);

  expect(leadsSchemas).toBe(leadsModule.leadsSchemas);
  expect(createLeadSchema).toBe(leadsModule.createLeadSchema);

  expect(ordersSchemas).toBe(ordersModule.ordersSchemas);
  expect(analyticsSchemas).toBe(analyticsModule.analyticsSchemas);
  expect(paymentsSchemas).toBe(paymentsModule.paymentsSchemas);

  expect(Object.keys(paymentsSchemas)).toEqual(
    expect.arrayContaining(['createIntent', 'stripeWebhook', 'paypalWebhook']),
  );
  expect(Object.keys(ordersSchemas)).toEqual(
    expect.arrayContaining(['create', 'paymentWebhook', 'byIdParams']),
  );
});

test('schema index exports are usable and enforce validation contracts', () => {
  const validRegister = registerSchema.safeParse({
    email: 'User@Example.com',
    password: 'Password42!',
  });
  expect(validRegister.success).toBe(true);
  expect(validRegister.data).toEqual({
    email: 'user@example.com',
    password: 'Password42!',
    role: 'customer',
  });

  const invalidCreateIntent = paymentsSchemas.createIntent.safeParse({
    idempotencyKey: 'short',
    email: 'bad-email',
    items: [],
    currency: 'EURO',
  });
  expect(invalidCreateIntent.success).toBe(false);
  expect(invalidCreateIntent.error.issues.map((issue) => issue.path.join('.'))).toEqual(
    expect.arrayContaining(['idempotencyKey', 'email', 'items', 'currency']),
  );
});