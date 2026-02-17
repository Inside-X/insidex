import { moneyToMinorUnits, minorUnitsToDecimalString, multiplyMinorUnits, sumMinorUnits } from '../../src/lib/money.js';

describe('money minor units helpers', () => {
  test('converts decimal values to integer minor units with half-up rounding', () => {
    expect(moneyToMinorUnits('0.01')).toBe(1);
    expect(moneyToMinorUnits('10.005')).toBe(1001);
    expect(moneyToMinorUnits('19.999')).toBe(2000);
    expect(moneyToMinorUnits(120.5)).toBe(12050);
  });

  test('formats minor units for DB decimal fields', () => {
    expect(minorUnitsToDecimalString(0)).toBe('0.00');
    expect(minorUnitsToDecimalString(1)).toBe('0.01');
    expect(minorUnitsToDecimalString(1001)).toBe('10.01');
    expect(minorUnitsToDecimalString(-25)).toBe('-0.25');
  });

  test('supports large integer-safe cart totals', () => {
    const lineA = multiplyMinorUnits(9_999_999, 1000);
    const lineB = multiplyMinorUnits(12_345, 4000);
    const total = sumMinorUnits([lineA, lineB]);

    expect(total).toBe(10_049_379_000);
    expect(minorUnitsToDecimalString(total)).toBe('100493790.00');
  });
});