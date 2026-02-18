import { fromMinorUnits, toMinorUnits } from '../../src/utils/minor-units.js';

describe('minor units financial normalization', () => {
  test('handles 0.1 + 0.2 without float drift', () => {
    const sumMinor = toMinorUnits('0.1') + toMinorUnits('0.2');
    expect(sumMinor).toBe(30);
    expect(fromMinorUnits(sumMinor)).toBe('0.30');
  });

  test('applies deterministic rounding', () => {
    expect(toMinorUnits('10.004', 'EUR')).toBe(1000);
    expect(toMinorUnits('10.005', 'EUR')).toBe(1001);
    expect(toMinorUnits('10.999', 'EUR')).toBe(1100);
  });

  test('supports multiple currency exponents', () => {
    expect(toMinorUnits('12.34', 'EUR')).toBe(1234);
    expect(fromMinorUnits(1234, 'EUR')).toBe('12.34');

    expect(toMinorUnits('12', 'JPY')).toBe(12);
    expect(fromMinorUnits(12, 'JPY')).toBe('12');
  });

  test('rejects invalid amount formats', () => {
    expect(() => toMinorUnits('12,34', 'EUR')).toThrow('Invalid decimal amount');
    expect(() => toMinorUnits('-1.00', 'EUR')).toThrow('Amount must be non-negative');
    expect(() => fromMinorUnits(1.5, 'EUR')).toThrow('Invalid minor units amount');
  });
});