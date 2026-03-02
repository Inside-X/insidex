import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const JEST_CONFIG = path.join(ROOT, 'jest.config.js');

const MONEY_COVERAGE_ALLOWLIST = [
  'src/routes/payments.routes.js',
  'src/routes/orders.routes.js',
  'src/routes/webhooks.routes.js',
  'src/middlewares/webhookStrictDependencyGuard.js',
  'src/lib/critical-dependencies.js',
  'src/utils/minor-units.js',
  'src/lib/webhook-idempotency-store.js',
];

const MONEY_PATH_DETECTORS = [
  /^src\/routes\/(payments|orders|webhooks)\.routes\.js$/,
  /^src\/middlewares\/webhookStrictDependencyGuard\.js$/,
  /^src\/lib\/(critical-dependencies|webhook-idempotency-store)\.js$/,
  /^src\/utils\/minor-units\.js$/,
];

function fail(invariant, found, expected, fix) {
  throw new Error([
    `[money-coverage-governance] ${invariant} violated.`,
    `Found: ${found}`,
    `Expected: ${expected}`,
    `How to fix: ${fix}`,
  ].join('\n'));
}

describe('money coverage governance', () => {
  test('keeps money-critical coverage list explicit and blocks broad coverage ignores', () => {
    const jestText = fs.readFileSync(JEST_CONFIG, 'utf8');

    for (const modulePath of MONEY_COVERAGE_ALLOWLIST) {
      if (!jestText.includes(`'${modulePath}':`)) {
        fail(
          'missing money module threshold entry',
          modulePath,
          'module must be present under coverageThreshold with explicit numeric thresholds',
          `Add explicit coverageThreshold['${modulePath}'] with statements/lines/functions >=95 and branches >=90.`
        );
      }
    }

    const srcFiles = fs
      .readdirSync(path.join(ROOT, 'src', 'routes'))
      .map((name) => `src/routes/${name}`)
      .concat(fs.readdirSync(path.join(ROOT, 'src', 'middlewares')).map((name) => `src/middlewares/${name}`))
      .concat(fs.readdirSync(path.join(ROOT, 'src', 'lib')).map((name) => `src/lib/${name}`))
      .concat(fs.readdirSync(path.join(ROOT, 'src', 'utils')).map((name) => `src/utils/${name}`));

    const detectedMoneyFiles = srcFiles
      .filter((candidate) => MONEY_PATH_DETECTORS.some((pattern) => pattern.test(candidate)))
      .sort();

    const allowlistSorted = [...MONEY_COVERAGE_ALLOWLIST].sort();
    if (JSON.stringify(detectedMoneyFiles) !== JSON.stringify(allowlistSorted)) {
      fail(
        'money coverage allowlist drift',
        detectedMoneyFiles.join(', ') || '(none)',
        allowlistSorted.join(', '),
        'If a new money-critical module is introduced, explicitly add it to MONEY_COVERAGE_ALLOWLIST and to jest coverageThreshold.'
      );
    }

    const forbiddenBroadIgnorePatterns = [
      /!src\/\*\*(?:['",\s\]])/,
      /!src\/routes\/\*\*(?:['",\s\]])/,
      /!src\/lib\/\*\*(?:['",\s\]])/,
      /!src\/middlewares\/\*\*(?:['",\s\]])/,
      /!src\/utils\/\*\*(?:['",\s\]])/,
    ];

    for (const pattern of forbiddenBroadIgnorePatterns) {
      const match = jestText.match(pattern);
      if (match) {
        fail(
          'broad coverage ignore detected',
          match[0],
          'no broad coverage ignore patterns',
          'Remove broad ignore pattern and rely only on explicit allowlisted ignores.'
        );
      }
    }
  });
});