const CURRENCY_EXPONENT = Object.freeze({
  EUR: 2,
  USD: 2,
  GBP: 2,
  JPY: 0,
  BHD: 3,
});

function normalizeCurrency(currency) {
  const normalized = String(currency || 'EUR').trim().toUpperCase();
  if (!CURRENCY_EXPONENT[normalized] && CURRENCY_EXPONENT[normalized] !== 0) {
    const error = new Error(`Unsupported currency for minor units: ${currency}`);
    error.code = 'UNSUPPORTED_CURRENCY';
    throw error;
  }
  return normalized;
}

function parseDecimalParts(amountDecimalString) {
  const normalized = String(amountDecimalString ?? '').trim();
  if (!/^[+-]?\d+(\.\d+)?$/.test(normalized)) {
    const error = new Error(`Invalid decimal amount: ${amountDecimalString}`);
    error.code = 'INVALID_AMOUNT_FORMAT';
    throw error;
  }

  const sign = normalized.startsWith('-') ? -1 : 1;
  const unsigned = normalized.replace(/^[+-]/, '');
  const [whole, frac = ''] = unsigned.split('.');
  return { sign, whole, frac };
}

function assertSafeInteger(value, message) {
  if (!Number.isSafeInteger(value)) {
    const error = new Error(message);
    error.code = 'AMOUNT_OUT_OF_RANGE';
    throw error;
  }
}

export function toMinorUnits(amountDecimalString, currency = 'EUR') {
  const normalizedCurrency = normalizeCurrency(currency);
  const exponent = CURRENCY_EXPONENT[normalizedCurrency];
  const { sign, whole, frac } = parseDecimalParts(amountDecimalString);

  if (sign < 0) {
    const error = new Error('Amount must be non-negative');
    error.code = 'NEGATIVE_AMOUNT';
    throw error;
  }

  const padded = frac.padEnd(exponent + 1, '0');
  const kept = exponent === 0 ? '' : padded.slice(0, exponent);
  const roundingDigit = BigInt(padded.charAt(exponent) || '0');

  let minor = BigInt(whole) * (10n ** BigInt(exponent));
  if (kept) {
    minor += BigInt(kept);
  }

  if (roundingDigit >= 5n) {
    minor += 1n;
  }

  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) {
    const error = new Error('Amount exceeds safe integer range');
    error.code = 'AMOUNT_OUT_OF_RANGE';
    throw error;
  }

  return parseInt(minor.toString(), 10);
}

export function fromMinorUnits(minorUnits, currency = 'EUR') {
  const normalizedCurrency = normalizeCurrency(currency);
  const exponent = CURRENCY_EXPONENT[normalizedCurrency];

  const isValidNumber = Number.isInteger(minorUnits) && minorUnits >= 0;
  const isValidBigInt = typeof minorUnits === 'bigint' && minorUnits >= 0n;
  if (!isValidNumber && !isValidBigInt) {
    const error = new Error(`Invalid minor units amount: ${minorUnits}`);
    error.code = 'INVALID_MINOR_UNITS';
    throw error;
  }

  if (isValidNumber) {
    assertSafeInteger(minorUnits, 'Amount exceeds safe integer range');
  }

  if (exponent === 0) {
    return String(minorUnits);
  }

  const asString = String(minorUnits).padStart(exponent + 1, '0');
  const whole = asString.slice(0, -exponent);
  const fraction = asString.slice(-exponent);
  return `${whole}.${fraction}`;
}

export function getCurrencyExponent(currency = 'EUR') {
  const normalizedCurrency = normalizeCurrency(currency);
  return CURRENCY_EXPONENT[normalizedCurrency];
}

function assertMinorUnitInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    const error = new Error(`Invalid ${label} minor units: ${value}`);
    error.code = 'INVALID_MINOR_UNITS';
    throw error;
  }
}

function assertQuantityInteger(quantity) {
  if (!Number.isInteger(quantity) || quantity < 0) {
    const error = new Error(`Invalid quantity: ${quantity}`);
    error.code = 'INVALID_QUANTITY';
    throw error;
  }
}

export function multiplyMinorUnits(unitMinor, quantity) {
  assertMinorUnitInteger(unitMinor, 'unit');
  assertQuantityInteger(quantity);
  const result = unitMinor * quantity;
  assertSafeInteger(result, 'Minor units multiplication exceeds safe integer range');
  return result;
}

export function sumMinorUnits(values) {
  return values.reduce((sum, value) => {
    assertMinorUnitInteger(sum, 'sum');
    assertMinorUnitInteger(value, 'line');
    const next = sum + value;
    assertSafeInteger(next, 'Minor units summation exceeds safe integer range');
    return next;
  }, 0);
}

export function multiplyMinorUnitsRatio(minorUnits, numerator, denominator) {
  assertMinorUnitInteger(minorUnits, 'unit');
  assertQuantityInteger(numerator);
  if (!Number.isInteger(denominator) || denominator <= 0) {
    const error = new Error(`Invalid denominator: ${denominator}`);
    error.code = 'INVALID_RATIO';
    throw error;
  }

  const product = BigInt(minorUnits) * BigInt(numerator);
  const divisor = BigInt(denominator);
  const quotient = product / divisor;
  const remainder = product % divisor;
  const rounded = remainder * 2n >= divisor ? quotient + 1n : quotient;

  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) {
    const error = new Error('Minor units ratio multiplication exceeds safe integer range');
    error.code = 'AMOUNT_OUT_OF_RANGE';
    throw error;
  }

  return Number(rounded);
}

function assertMinorUnitBigInt(value, label) {
  if (typeof value !== 'bigint' || value < 0n) {
    const error = new Error(`Invalid ${label} minor units bigint: ${value}`);
    error.code = 'INVALID_MINOR_UNITS';
    throw error;
  }
}

function assertQuantityBigInt(quantity) {
  if (typeof quantity !== 'bigint' || quantity < 0n) {
    const error = new Error(`Invalid quantity bigint: ${quantity}`);
    error.code = 'INVALID_QUANTITY';
    throw error;
  }
}

export function multiplyMinorUnitsBigInt(unitMinor, quantity) {
  assertMinorUnitBigInt(unitMinor, 'unit');
  assertQuantityBigInt(quantity);
  return unitMinor * quantity;
}

export function sumMinorUnitsBigInt(values) {
  return values.reduce((sum, value) => {
    assertMinorUnitBigInt(sum, 'sum');
    assertMinorUnitBigInt(value, 'line');
    return sum + value;
  }, 0n);
}

export default {
  toMinorUnits,
  fromMinorUnits,
  getCurrencyExponent,
  multiplyMinorUnits,
  sumMinorUnits,
  multiplyMinorUnitsRatio,
  multiplyMinorUnitsBigInt,
  sumMinorUnitsBigInt,
};