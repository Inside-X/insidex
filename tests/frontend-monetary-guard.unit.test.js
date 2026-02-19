import fs from 'node:fs';

const monetaryFiles = [
  'js/checkout.js',
  'js/account.js',
  'js/modules/cart.js',
  'js/modules/cartDrawer.js',
  'js/modules/catalogSearch.js',
];

const forbiddenPatterns = [
  { label: 'Number()', re: /\bNumber\s*\(/ },
  { label: 'parseFloat()', re: /\bparseFloat\s*\(/ },
  { label: '/100 inline', re: /\/\s*100\b/ },
  { label: '*100 inline', re: /\*\s*100\b/ },
  { label: 'toFixed()', re: /\btoFixed\s*\(/ },
];

describe('frontend monetary safety guard', () => {
  test('forbidden float-money patterns are absent from monetary modules', () => {
    for (const file of monetaryFiles) {
      const source = fs.readFileSync(file, 'utf8');
      for (const { label, re } of forbiddenPatterns) {
        expect(source).not.toMatch(re);
      }
    }
  });
});