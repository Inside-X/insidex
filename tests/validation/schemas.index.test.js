import { test, expect } from '@jest/globals';

import * as schemaIndex from '../../src/validation/schemas/index.js';
import * as authModule from '../../src/validation/schemas/auth.schema.js';
import * as productsModule from '../../src/validation/schemas/products.schema.js';
import * as cartModule from '../../src/validation/schemas/cart.schema.js';
import * as leadsModule from '../../src/validation/schemas/leads.schema.js';
import * as ordersModule from '../../src/validation/schemas/orders.schema.js';
import * as analyticsModule from '../../src/validation/schemas/analytics.schema.js';
import * as paymentsModule from '../../src/validation/schemas/payments.schema.js';
import * as commonModule from '../../src/validation/schemas/common.schema.js';

test('schema index exports the expected schema surface', () => {
  expect(Object.keys(schemaIndex).sort()).toEqual([
    'SECONDARY_PAYLOAD_MAX_BYTES',
    'SECONDARY_PAYLOAD_MAX_KEYS',
    'addToCartSchema',
    'analyticsSchemas',
    'authSchemas',
    'boundedSecondaryPayloadSchema',
    'cartSchemas',
    'commonSchemas',
    'createLeadSchema',
    'createProductSchema',
    'leadsSchemas',
    'loginSchema',
    'ordersSchemas',
    'paymentsSchemas',
    'productsSchemas',
    'registerSchema',
  ]);

  expect(typeof schemaIndex.authSchemas).toBe('object');
  expect(typeof schemaIndex.registerSchema).toBe('object');
  expect(typeof schemaIndex.loginSchema).toBe('object');
  expect(typeof schemaIndex.productsSchemas).toBe('object');
  expect(typeof schemaIndex.createProductSchema).toBe('object');
  expect(typeof schemaIndex.cartSchemas).toBe('object');
  expect(typeof schemaIndex.addToCartSchema).toBe('object');
  expect(typeof schemaIndex.leadsSchemas).toBe('object');
  expect(typeof schemaIndex.createLeadSchema).toBe('object');
  expect(typeof schemaIndex.ordersSchemas).toBe('object');
  expect(typeof schemaIndex.analyticsSchemas).toBe('object');
  expect(typeof schemaIndex.paymentsSchemas).toBe('object');
  expect(typeof schemaIndex.commonSchemas).toBe('object');
  expect(typeof schemaIndex.boundedSecondaryPayloadSchema).toBe('object');
  expect(typeof schemaIndex.SECONDARY_PAYLOAD_MAX_KEYS).toBe('number');
  expect(typeof schemaIndex.SECONDARY_PAYLOAD_MAX_BYTES).toBe('number');
});

test('schema index re-exports direct module references', () => {
  expect(schemaIndex.authSchemas).toBe(authModule.authSchemas);
  expect(schemaIndex.registerSchema).toBe(authModule.registerSchema);
  expect(schemaIndex.loginSchema).toBe(authModule.loginSchema);

  expect(schemaIndex.productsSchemas).toBe(productsModule.productsSchemas);
  expect(schemaIndex.createProductSchema).toBe(productsModule.createProductSchema);

  expect(schemaIndex.cartSchemas).toBe(cartModule.cartSchemas);
  expect(schemaIndex.addToCartSchema).toBe(cartModule.addToCartSchema);

  expect(schemaIndex.leadsSchemas).toBe(leadsModule.leadsSchemas);
  expect(schemaIndex.createLeadSchema).toBe(leadsModule.createLeadSchema);

  expect(schemaIndex.ordersSchemas).toBe(ordersModule.ordersSchemas);
  expect(schemaIndex.analyticsSchemas).toBe(analyticsModule.analyticsSchemas);
  expect(schemaIndex.paymentsSchemas).toBe(paymentsModule.paymentsSchemas);

  expect(schemaIndex.commonSchemas).toBe(commonModule.commonSchemas);
  expect(schemaIndex.boundedSecondaryPayloadSchema).toBe(commonModule.boundedSecondaryPayloadSchema);
  expect(schemaIndex.SECONDARY_PAYLOAD_MAX_KEYS).toBe(commonModule.SECONDARY_PAYLOAD_MAX_KEYS);
  expect(schemaIndex.SECONDARY_PAYLOAD_MAX_BYTES).toBe(commonModule.SECONDARY_PAYLOAD_MAX_BYTES);
});