import { test, expect } from '@jest/globals';

import * as commonSchemas from '../../src/validation/schemas/common.schema.js';

test('common schema module exports an empty shared-schema object surface', () => {
  expect(typeof commonSchemas).toBe('object');
  expect(Object.keys(commonSchemas)).toEqual([]);
  expect(Reflect.ownKeys(commonSchemas)).toEqual([Symbol.toStringTag]);
});