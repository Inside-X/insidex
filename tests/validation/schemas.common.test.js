import { test, expect } from '@jest/globals';

import * as commonSchemas from '../../src/validation/schemas/common.schema.js';

test('common schema module exposes an intentionally empty shared-schemas surface', () => {
  // Contract: no shared schema primitives are published yet from this module.
  expect(Object.keys(commonSchemas)).toHaveLength(0);
  expect('default' in commonSchemas).toBe(false);
});