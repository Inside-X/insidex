const MONEY_SCALE = 2;
const SCALE_FACTOR = 10n ** BigInt(MONEY_SCALE);

function parseMoneyInput(value) {
  const normalized = String(value ?? '').trim();
  const match = normalized.match(/^(-)?(\d+)(?:\.(\d+))?$/);
  if (!match) {
    throw new Error(`Invalid money value: ${value}`);
  }

  return {
    negative: Boolean(match[1]),
    intPart: match[2],
    fracPart: match[3] || '',
  };
}

function safeBigIntToNumber(value, context) {
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  const min = BigInt(Number.MIN_SAFE_INTEGER);
  if (value > max || value < min) {
    throw new Error(`${context} exceeds Number safe integer range`);
  }
  return Number(value);
}

export function moneyToMinorUnits(value) {
  const { negative, intPart, fracPart } = parseMoneyInput(value);

  let cents = BigInt(intPart) * SCALE_FACTOR;
  const padded = (fracPart + '0'.repeat(MONEY_SCALE)).slice(0, MONEY_SCALE);
  cents += BigInt(padded || '0');

  if (fracPart.length > MONEY_SCALE) {
    const remainder = fracPart.slice(MONEY_SCALE);
    const firstRemainder = Number(remainder[0]);
    if (firstRemainder >= 5) {
      cents += 1n;
    }
  }

  if (negative) cents *= -1n;

  return safeBigIntToNumber(cents, 'moneyToMinorUnits');
}

export function minorUnitsToDecimalString(minorUnits) {
  const value = BigInt(minorUnits);
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const units = absolute / SCALE_FACTOR;
  const cents = String(absolute % SCALE_FACTOR).padStart(MONEY_SCALE, '0');
  return `${negative ? '-' : ''}${units.toString()}.${cents}`;
}

export function multiplyMinorUnits(unitMinor, quantity) {
  const total = BigInt(unitMinor) * BigInt(quantity);
  return safeBigIntToNumber(total, 'multiplyMinorUnits');
}

export function sumMinorUnits(values) {
  const total = values.reduce((acc, value) => acc + BigInt(value), 0n);
  return safeBigIntToNumber(total, 'sumMinorUnits');
}

export default {
  moneyToMinorUnits,
  minorUnitsToDecimalString,
  multiplyMinorUnits,
  sumMinorUnits,
};