import { assertStrictMonetaryJsonValue, parseJsonWithStrictMonetaryValidation } from '../../src/utils/strict-monetary-json.js';

describe('strict monetary json parser', () => {
  test('accepts nested monetary strings including negative and high precision values', () => {
    const payload = {
      amount: '10.00',
      nested: {
        items: [
          { unitPrice: '0.0000000000000000001', tax: '0.00' },
          { discount: '-5.50', shipping: '2.10' },
        ],
      },
    };

    expect(() => assertStrictMonetaryJsonValue(payload)).not.toThrow();
  });

  test.each([
    ['numeric float', '{"amount":10.5}', 'Monetary values must be provided as strings'],
    ['scientific notation', '{"amount":"1e2"}', 'Scientific notation is forbidden'],
    ['NaN token', '{"amount":NaN}', 'Malformed test payload'],
    ['Infinity token', '{"amount":Infinity}', 'Malformed test payload'],
    ['Infinity string', '{"amount":"Infinity"}', 'Malformed monetary decimal string'],
    ['malformed string', '{"amount":"1.2.3"}', 'Malformed monetary decimal string'],
    ['surrounding spaces', '{"amount":" 1.00 "}', 'surrounding spaces'],
    ['empty string', '{"amount":""}', 'must not be empty'],
  ])('rejects %s', (_name, raw, expectedMessage) => {
    expect(() => parseJsonWithStrictMonetaryValidation(raw, 'test payload')).toThrow(expectedMessage);
  });

  test('accepts valid minor-unit compatible integer decimal string', () => {
    expect(() => parseJsonWithStrictMonetaryValidation('{"amount":"100"}', 'test payload')).not.toThrow();
  });

  test('throws malformed JSON parse error for invalid JSON', () => {
    expect(() => parseJsonWithStrictMonetaryValidation('{', 'test payload')).toThrow('Malformed test payload');
  });
});