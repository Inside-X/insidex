const MONETARY_KEYS = new Set([
  'amount',
  'total',
  'price',
  'unitPrice',
  'tax',
  'discount',
  'subtotal',
  'dbUnitPrice',
  'shipping',
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function throwMonetaryParseError(message, path) {
  const error = new SyntaxError(path ? `${message} at ${path}` : message);
  error.statusCode = 400;
  throw error;
}

function assertMonetaryStringValue(value, path) {
  if (typeof value !== 'string') {
    throwMonetaryParseError('Monetary values must be provided as strings', path);
  }

  if (value !== value.trim()) {
    throwMonetaryParseError('Monetary values must not include surrounding spaces', path);
  }

  if (value.length === 0) {
    throwMonetaryParseError('Monetary values must not be empty', path);
  }

  if (/[eE]/.test(value)) {
    throwMonetaryParseError('Scientific notation is forbidden for monetary values', path);
  }

  if (!/^-?\d+(\.\d+)?$/.test(value)) {
    throwMonetaryParseError('Malformed monetary decimal string', path);
  }
}

export function assertStrictMonetaryJsonValue(value, path = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertStrictMonetaryJsonValue(item, `${path}[${index}]`));
    return;
  }

  if (!isPlainObject(value)) {
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const currentPath = `${path}.${key}`;
    if (MONETARY_KEYS.has(key) && nestedValue !== null && nestedValue !== undefined) {
      assertMonetaryStringValue(nestedValue, currentPath);
    }
    assertStrictMonetaryJsonValue(nestedValue, currentPath);
  }
}

export function parseJsonWithStrictMonetaryValidation(raw, source = 'JSON payload') {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const error = new SyntaxError(`Malformed ${source}`);
    error.statusCode = 400;
    throw error;
  }

  assertStrictMonetaryJsonValue(parsed);
  return parsed;
}

export { MONETARY_KEYS };