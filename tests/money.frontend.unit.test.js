import {
  fromMinorUnits,
  fromMinorUnitsNumber,
  multiplyMinorUnits,
  sumMinorUnits,
  toMinorUnitsDecimalString,
} from '../js/modules/money.js';

describe('frontend money minor-unit helpers', () => {
  test('converts decimal strings into minor units with half-up rounding', () => {
    expect(toMinorUnitsDecimalString('12.34', 'EUR')).toBe(1234n);
    expect(toMinorUnitsDecimalString('12.345', 'EUR')).toBe(1235n);
    expect(toMinorUnitsDecimalString('0.004', 'EUR')).toBe(0n);
  });

  test('multiplies and sums in minor units only', () => {
    const lineA = multiplyMinorUnits(toMinorUnitsDecimalString('19.99', 'EUR'), 2);
    const lineB = multiplyMinorUnits(toMinorUnitsDecimalString('0.01', 'EUR'), 3);
    expect(sumMinorUnits([lineA, lineB])).toBe(4001n);
    expect(fromMinorUnits(sumMinorUnits([lineA, lineB]), 'EUR')).toBe('40.01');
  });

  test('converts minor units to finite display numbers through dedicated helper', () => {
    expect(fromMinorUnitsNumber(4001n, 'EUR')).toBe(40.01);
  });
  
  test('rejects scientific notation, malformed input, negative amounts and float input', () => {
    expect(() => toMinorUnitsDecimalString('1e3', 'EUR')).toThrow(/Invalid decimal amount/);
    expect(() => toMinorUnitsDecimalString('abc', 'EUR')).toThrow(/Invalid decimal amount/);
    expect(() => toMinorUnitsDecimalString('-1.00', 'EUR')).toThrow(/non-negative/);
    expect(() => toMinorUnitsDecimalString(10.5, 'EUR')).toThrow(/decimal strings/);
  });

  test('supports high precision / high magnitude via bigint output', () => {
    const minor = toMinorUnitsDecimalString('999999999999999999.9999', 'EUR');
    expect(typeof minor).toBe('bigint');
    expect(fromMinorUnits(minor, 'EUR')).toBe('1000000000000000000.00');
  });
});