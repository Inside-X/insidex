import {
  toMinorUnits,
  fromMinorUnits,
  multiplyMinorUnits,
  sumMinorUnits,
  multiplyMinorUnitsRatio,
  multiplyMinorUnitsBigInt,
  sumMinorUnitsBigInt,
} from '../../src/utils/minor-units.js';

describe('minor-units destructive financial audit suite', () => {
  describe('currency handling and exponent fidelity', () => {
    it('supports 0-decimal JPY, 2-decimal EUR/USD, and 3-decimal BHD', () => {
      // Rationale: regulator-facing support for per-currency exponent maps must be explicit.
      expect(toMinorUnits('123', 'JPY')).toEqual(123);
      expect(fromMinorUnits(123, 'JPY')).toEqual('123');

      expect(toMinorUnits('123.45', 'EUR')).toEqual(12345);
      expect(fromMinorUnits(12345, 'EUR')).toEqual('123.45');

      expect(toMinorUnits('123.45', 'USD')).toEqual(12345);
      expect(fromMinorUnits(12345, 'USD')).toEqual('123.45');

      expect(toMinorUnits('123.456', 'BHD')).toEqual(123456);
      expect(fromMinorUnits(123456, 'BHD')).toEqual('123.456');
    });

    it('normalizes mixed-case and whitespace-padded currencies', () => {
      // Rationale: integration boundaries frequently pass case-variant currency codes.
      expect(toMinorUnits('1.23', ' eur ')).toEqual(123);
      expect(toMinorUnits('1.23', 'Usd')).toEqual(123);
      expect(toMinorUnits('1', ' jPy')).toEqual(1);
      expect(toMinorUnits('1.234', ' bhd ')).toEqual(1234);
    });

    it('throws deterministic errors for unsupported currencies', () => {
      // Rationale: unknown currency should fail-closed with explicit, deterministic messages and codes.
      expect(() => toMinorUnits('1.00', 'AUD')).toThrow('Unsupported currency for minor units: AUD');
      expect(() => fromMinorUnits(100, 'BTC')).toThrow('Unsupported currency for minor units: BTC');
      expect(() => toMinorUnits('1.00', '   ')).toThrow('Unsupported currency for minor units:    ');
    });
  });

  describe('numeric parsing edge-cases and coercion boundaries', () => {
    it('accepts valid strings and numbers and rejects malformed formats', () => {
      // Rationale: only canonical decimal format is permitted; no locale or scientific notation ambiguity.
      expect(toMinorUnits('  10.50  ', 'EUR')).toEqual(1050);
      expect(toMinorUnits(10.5, 'EUR')).toEqual(1050);
      expect(toMinorUnits('00010.50', 'EUR')).toEqual(1050);

      expect(() => toMinorUnits('12,34', 'EUR')).toThrow('Invalid decimal amount: 12,34');
      expect(() => toMinorUnits('1e10', 'EUR')).toThrow('Invalid decimal amount: 1e10');
      expect(() => toMinorUnits('1.', 'EUR')).toThrow('Invalid decimal amount: 1.');
      expect(() => toMinorUnits('.1', 'EUR')).toThrow('Invalid decimal amount: .1');
      expect(() => toMinorUnits('abc', 'EUR')).toThrow('Invalid decimal amount: abc');
      expect(() => toMinorUnits(null, 'EUR')).toThrow('Invalid decimal amount: null');
      expect(() => toMinorUnits(undefined, 'EUR')).toThrow('Invalid decimal amount: undefined');
      expect(() => toMinorUnits(NaN, 'EUR')).toThrow('Invalid decimal amount: NaN');
      expect(() => toMinorUnits(Infinity, 'EUR')).toThrow('Invalid decimal amount: Infinity');
      expect(() => toMinorUnits(-Infinity, 'EUR')).toThrow('Invalid decimal amount: -Infinity');
    });

    it('rejects negative decimals deterministically', () => {
      // Rationale: order-flow contract requires non-negative minor units.
      expect(() => toMinorUnits('-0.01', 'EUR')).toThrow('Amount must be non-negative');
      expect(() => toMinorUnits('-1', 'JPY')).toThrow('Amount must be non-negative');
    });

    it('handles long decimal tails with deterministic half-up rounding', () => {
      // Rationale: precision tails must not leak IEEE754 behavior into integer ledgers.
      expect(toMinorUnits('1.234567890123456789', 'EUR')).toEqual(123);
      expect(toMinorUnits('1.235000000000000000', 'EUR')).toEqual(124);
      expect(toMinorUnits('1.2344', 'BHD')).toEqual(1234);
      expect(toMinorUnits('1.2345', 'BHD')).toEqual(1235);
      expect(toMinorUnits('9.9', 'JPY')).toEqual(10);
      expect(toMinorUnits('9.4', 'JPY')).toEqual(9);
    });

    it('enforces MAX_SAFE_INTEGER boundaries for conversion and formatting', () => {
      // Rationale: numeric outputs must stay within exactly representable JS integer space.
      expect(toMinorUnits('90071992547409.91', 'EUR')).toEqual(Number.MAX_SAFE_INTEGER);
      expect(() => toMinorUnits('90071992547409.92', 'EUR')).toThrow('Amount exceeds safe integer range');

      expect(fromMinorUnits(Number.MAX_SAFE_INTEGER, 'EUR')).toEqual('90071992547409.91');
      expect(() => fromMinorUnits(Number.MAX_SAFE_INTEGER + 1, 'EUR')).toThrow('Amount exceeds safe integer range');
    });

    it('validates fromMinorUnits inputs across number/bigint and rejects invalid values', () => {
      // Rationale: financial serializers must fail-closed on all non-integer or negative paths.
      expect(fromMinorUnits(0, 'EUR')).toEqual('0.00');
      expect(fromMinorUnits(1n, 'EUR')).toEqual('0.01');
      expect(fromMinorUnits(1n, 'JPY')).toEqual('1');

      expect(() => fromMinorUnits(-1, 'EUR')).toThrow('Invalid minor units amount: -1');
      expect(() => fromMinorUnits(-1n, 'EUR')).toThrow('Invalid minor units amount: -1');
      expect(() => fromMinorUnits(1.1, 'EUR')).toThrow('Invalid minor units amount: 1.1');
      expect(() => fromMinorUnits('100', 'EUR')).toThrow('Invalid minor units amount: 100');
      expect(() => fromMinorUnits(null, 'EUR')).toThrow('Invalid minor units amount: null');
      expect(() => fromMinorUnits(undefined, 'EUR')).toThrow('Invalid minor units amount: undefined');
      expect(() => fromMinorUnits(NaN, 'EUR')).toThrow('Invalid minor units amount: NaN');
      expect(() => fromMinorUnits(Infinity, 'EUR')).toThrow('Invalid minor units amount: Infinity');
    });
  });

  describe('round-trip idempotence and drift resistance', () => {
    it('preserves stable values in repeated toMinorUnits <-> fromMinorUnits cycles', () => {
      // Rationale: repeated conversion cycles must be stable over operational retries/replays.
      const seedValues = [
        ['0.00', 'EUR'],
        ['0.01', 'EUR'],
        ['10.05', 'EUR'],
        ['999999.99', 'USD'],
        ['999999', 'JPY'],
        ['1.234', 'BHD'],
      ];

      seedValues.forEach(([amount, currency]) => {
        const minor = toMinorUnits(amount, currency);
        let decimal = fromMinorUnits(minor, currency);

        for (let i = 0; i < 25; i += 1) {
          const cycledMinor = toMinorUnits(decimal, currency);
          const cycledDecimal = fromMinorUnits(cycledMinor, currency);
          expect(cycledMinor).toEqual(minor);
          expect(cycledDecimal).toEqual(decimal);
          decimal = cycledDecimal;
        }
      });
    });
  });

  describe('arithmetic helpers and rounding correctness', () => {
    it('multiplies and sums minor units without IEEE754 leakage', () => {
      // Rationale: integer helpers must produce exact cents with no floating drift.
      expect(multiplyMinorUnits(10, 3)).toEqual(30);
      expect(multiplyMinorUnits(12345, 0)).toEqual(0);
      expect(sumMinorUnits([10, 20, 30])).toEqual(60);
      expect(sumMinorUnits([1, 2, 3, 4, 5])).toEqual(15);

      const cents = toMinorUnits('0.10', 'EUR');
      expect(sumMinorUnits([cents, cents, cents])).toEqual(30);
      expect(fromMinorUnits(sumMinorUnits([cents, cents, cents]), 'EUR')).toEqual('0.30');
    });

    it('computes ratio multiplication with deterministic half-up rounding', () => {
      // Rationale: tax/discount pro-rating must use integer arithmetic with deterministic rounding.
      expect(multiplyMinorUnitsRatio(100, 1, 3)).toEqual(33);
      expect(multiplyMinorUnitsRatio(101, 1, 2)).toEqual(51);
      expect(multiplyMinorUnitsRatio(100, 1, 2)).toEqual(50);
      expect(multiplyMinorUnitsRatio(1, 1, 2)).toEqual(1);
      expect(multiplyMinorUnitsRatio(999999, 7, 9)).toEqual(777777);
    });

    it('rejects invalid arithmetic inputs deterministically', () => {
      // Rationale: helper APIs must never permit partial arithmetic on invalid numeric types.
      expect(() => multiplyMinorUnits(-1, 1)).toThrow('Invalid unit minor units: -1');
      expect(() => multiplyMinorUnits(1, -1)).toThrow('Invalid quantity: -1');
      expect(() => multiplyMinorUnits(1.1, 1)).toThrow('Invalid unit minor units: 1.1');
      expect(() => multiplyMinorUnits(1, 1.1)).toThrow('Invalid quantity: 1.1');

      expect(() => sumMinorUnits([1, -1])).toThrow('Invalid line minor units: -1');
      expect(() => sumMinorUnits([1, 2.2])).toThrow('Invalid line minor units: 2.2');
      expect(() => sumMinorUnits([1, Number.NaN])).toThrow('Invalid line minor units: NaN');

      expect(() => multiplyMinorUnitsRatio(-1, 1, 2)).toThrow('Invalid unit minor units: -1');
      expect(() => multiplyMinorUnitsRatio(1, -1, 2)).toThrow('Invalid quantity: -1');
      expect(() => multiplyMinorUnitsRatio(1, 1, 0)).toThrow('Invalid denominator: 0');
      expect(() => multiplyMinorUnitsRatio(1, 1, -2)).toThrow('Invalid denominator: -2');
      expect(() => multiplyMinorUnitsRatio(1, 1, 2.5)).toThrow('Invalid denominator: 2.5');
    });
  });

  describe('overflow and aggregation safety checks', () => {
    it('throws for multiplication and ratio operations that exceed safe integer bounds', () => {
      // Rationale: overflow paths must fail explicitly before ledger corruption.
      expect(() => multiplyMinorUnits(Number.MAX_SAFE_INTEGER, 2)).toThrow('Minor units multiplication exceeds safe integer range');
      expect(() => multiplyMinorUnitsRatio(Number.MAX_SAFE_INTEGER, 2, 1)).toThrow('Minor units ratio multiplication exceeds safe integer range');
    });

    it('throws for summation overflow when aggregating extreme values', () => {
      // Rationale: high-volume batch totals can overflow if not guarded.
      expect(() => sumMinorUnits([Number.MAX_SAFE_INTEGER, 1])).toThrow('Minor units summation exceeds safe integer range');
      expect(sumMinorUnits([Number.MAX_SAFE_INTEGER - 1, 1])).toEqual(Number.MAX_SAFE_INTEGER);
    });

    it('supports BigInt arithmetic variants for values beyond Number bounds', () => {
      // Rationale: optional BigInt paths must provide exact arithmetic for very large totals.
      const huge = 90071992547409931234567890n;
      expect(multiplyMinorUnitsBigInt(huge, 3n)).toEqual(270215977642229793703703670n);
      expect(sumMinorUnitsBigInt([huge, 10n, 20n])).toEqual(90071992547409931234567920n);
    });

    it('rejects invalid BigInt helper inputs deterministically', () => {
      // Rationale: BigInt APIs must enforce strict type contracts.
      expect(() => multiplyMinorUnitsBigInt(-1n, 1n)).toThrow('Invalid unit minor units bigint: -1');
      expect(() => multiplyMinorUnitsBigInt(1n, -1n)).toThrow('Invalid quantity bigint: -1');
      expect(() => multiplyMinorUnitsBigInt(1, 1n)).toThrow('Invalid unit minor units bigint: 1');
      expect(() => sumMinorUnitsBigInt([1n, -1n])).toThrow('Invalid line minor units bigint: -1');
      expect(() => sumMinorUnitsBigInt([1n, 1])).toThrow('Invalid line minor units bigint: 1');
    });
  });
});