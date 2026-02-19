import { existsSync } from 'node:fs';

describe('payloadGuard presence', () => {
  test('module is not present in repository', () => {
    expect(existsSync('src/middlewares/payloadGuard.js')).toBe(false);
  });
});