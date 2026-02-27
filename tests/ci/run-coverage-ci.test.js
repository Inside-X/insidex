import { describe, expect, test } from '@jest/globals';

import { shouldFallbackToCoverageJest } from '../../scripts/ci/run-coverage-ci.js';

describe('shouldFallbackToCoverageJest', () => {
  test('triggers fallback on Prisma engine 403 download failure', () => {
    const output = [
      'Error: request failed with status code 403 Forbidden',
      'Prisma engine download failed while fetching from CDN',
    ].join('\n');

    expect(shouldFallbackToCoverageJest(output)).toBe(true);
  });

  test('triggers fallback on Prisma engine checksum failure', () => {
    const output = 'Prisma engine checksum mismatch detected for downloaded binary';
    expect(shouldFallbackToCoverageJest(output)).toBe(true);
  });

  test('does not fallback for generic non-Prisma test failures', () => {
    const output = 'FAIL tests/smoke.test.js\nExpected: true\nReceived: false';
    expect(shouldFallbackToCoverageJest(output)).toBe(false);
  });

  test('does not fallback on generic Prisma mention without engine download/checksum signal', () => {
    const output = 'Prisma client initialization error in unrelated test assertion';
    expect(shouldFallbackToCoverageJest(output)).toBe(false);
  });
});