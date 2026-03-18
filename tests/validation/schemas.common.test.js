import { test, expect } from '@jest/globals';

import {
  SECONDARY_PAYLOAD_MAX_BYTES,
  SECONDARY_PAYLOAD_MAX_KEYS,
  boundedSecondaryPayloadSchema,
  commonSchemas,
} from '../../src/validation/schemas/common.schema.js';

test('common schema module exports shared schema primitives', () => {
  expect(SECONDARY_PAYLOAD_MAX_KEYS).toBe(120);
  expect(SECONDARY_PAYLOAD_MAX_BYTES).toBe(16 * 1024);
  expect(typeof boundedSecondaryPayloadSchema.safeParse).toBe('function');
  expect(commonSchemas).toEqual({
    boundedSecondaryPayload: boundedSecondaryPayloadSchema,
  });
});