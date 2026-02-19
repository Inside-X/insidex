const CURRENCY_EXPONENT = Object.freeze({
  EUR: 2,
  USD: 2,
  GBP: 2,
  JPY: 0,
});

function normalizeCurrency(currency) {
  const normalized = String(currency || 'EUR').trim().toUpperCase();
  if (!(normalized in CURRENCY_EXPONENT)) {
    const error = new Error(`Unsupported currency for minor units: ${currency}`);
    error.code = 'UNSUPPORTED_CURRENCY';
    throw error;
  }
  return normalized;
}

function parseDecimalParts(amountDecimalString) {
  if (typeof amountDecimalString !== 'string') {
    const error = new Error('Money values must be decimal strings (float input is forbidden)');
    error.code = 'UNSAFE_FLOAT_INPUT';
    throw error;
  }

  const normalized = amountDecimalString.trim();
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

export function toMinorUnitsDecimalString(amountDecimalString, currency = 'EUR') {
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

  return minor;
}

export function fromMinorUnits(minorUnits, currency = 'EUR') {
  const normalizedCurrency = normalizeCurrency(currency);
  const exponent = CURRENCY_EXPONENT[normalizedCurrency];

  const asBigInt = typeof minorUnits === 'bigint'
    ? minorUnits
    : (typeof minorUnits === 'number' && Number.isInteger(minorUnits) ? BigInt(minorUnits) : null);

  if (asBigInt === null || asBigInt < 0n) {
    const error = new Error(`Invalid minor units amount: ${minorUnits}`);
    error.code = 'INVALID_MINOR_UNITS';
    throw error;
  }

  if (exponent === 0) {
    return asBigInt.toString();
  }

  const asString = asBigInt.toString().padStart(exponent + 1, '0');
  const whole = asString.slice(0, -exponent);
  const fraction = asString.slice(-exponent);
  return `${whole}.${fraction}`;
}

export function fromMinorUnitsNumber(minorUnits, currency = 'EUR') {
  const decimal = fromMinorUnits(minorUnits, currency);
  const parsed = Number.parseFloat(decimal);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid decimal representation from minor units: ${decimal}`);
  }
  return parsed;
}

export function multiplyMinorUnits(unitMinor, qty) {
  if (typeof unitMinor !== 'bigint' || unitMinor < 0n) {
    const error = new Error(`Invalid unit minor units: ${unitMinor}`);
    error.code = 'INVALID_MINOR_UNITS';
    throw error;
  }
  if (!Number.isInteger(qty) || qty < 0) {
    const error = new Error(`Invalid quantity: ${qty}`);
    error.code = 'INVALID_QUANTITY';
    throw error;
  }
  return unitMinor * BigInt(qty);
}

export function sumMinorUnits(values) {
  return values.reduce((sum, value) => {
    if (typeof sum !== 'bigint' || sum < 0n || typeof value !== 'bigint' || value < 0n) {
      const error = new Error(`Invalid minor units value in sum: ${value}`);
      error.code = 'INVALID_MINOR_UNITS';
      throw error;
    }
    return sum + value;
  }, 0n);
}

export function multiplyMinorUnitsRatio(minorUnits, numerator, denominator) {
  if (typeof minorUnits !== 'bigint' || minorUnits < 0n) {
    throw new Error(`Invalid minor units amount: ${minorUnits}`);
  }
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator) || denominator <= 0) {
    throw new Error(`Invalid ratio: ${numerator}/${denominator}`);
  }

  const scaled = minorUnits * BigInt(numerator);
  const den = BigInt(denominator);
  return (scaled + (den / 2n)) / den;
}

export default {
  toMinorUnitsDecimalString,
  fromMinorUnits,
  fromMinorUnitsNumber,
  multiplyMinorUnits,
  sumMinorUnits,
  multiplyMinorUnitsRatio,
};