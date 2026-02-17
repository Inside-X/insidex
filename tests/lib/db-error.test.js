import { normalizeDbError } from '../../src/lib/db-error.js';

describe('normalizeDbError', () => {
  test('rethrows explicit 4xx errors', () => {
    const err = Object.assign(new Error('bad'), { statusCode: 400 });
    expect(() => normalizeDbError(err, { x: 1 })).toThrow('bad');
  });

  test('maps P2002 to 409', () => {
    const err = Object.assign(new Error('uniq'), { code: 'P2002' });
    try {
      normalizeDbError(err);
    } catch (mapped) {
      expect(mapped.statusCode).toBe(409);
      expect(mapped.code).toBe('DB_UNIQUE_CONSTRAINT');
    }
  });

  test('maps P2025 to 404', () => {
    const err = Object.assign(new Error('nf'), { code: 'P2025' });
    try {
      normalizeDbError(err);
    } catch (mapped) {
      expect(mapped.statusCode).toBe(404);
      expect(mapped.code).toBe('DB_RECORD_NOT_FOUND');
    }
  });

  test('maps unknown errors to 500', () => {
    const err = Object.assign(new Error('x'), { code: 'X' });
    try {
      normalizeDbError(err);
    } catch (mapped) {
      expect(mapped.statusCode).toBe(500);
      expect(mapped.code).toBe('DB_OPERATION_FAILED');
    }
  });
});