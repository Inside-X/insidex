import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const PACKAGE_JSON_PATH = path.join(REPO_ROOT, 'package.json');
const CHAOS_DIR = path.join(REPO_ROOT, 'tests', 'chaos');

const EXPECTED_CHAOS_FILES = [
  'chaos.failclosed.money.test.js',
  'chaos.webhooks.antibutterfly.test.js',
  'chaos.logging.reasoncodes.test.js',
];

function readUtf8(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function failWithGuidance(invariant, found, expected, fix) {
  throw new Error(
    [
      `[governance] ${invariant} violated.`,
      `Found: ${found}`,
      `Expected: ${expected}`,
      `How to fix: ${fix}`,
    ].join('\n')
  );
}

function assertIncludes(haystack, needle, invariant, fix) {
  if (!haystack.includes(needle)) {
    failWithGuidance(invariant, JSON.stringify(haystack), `must include ${JSON.stringify(needle)}`, fix);
  }
}

describe('chaos suite governance guard', () => {
  test('enforces strict chaos gate script + canonical file mapping + anti-drift checks', () => {
    const pkgRaw = readUtf8(PACKAGE_JSON_PATH);
    const pkg = JSON.parse(pkgRaw);
    const chaosScript = pkg?.scripts?.['test:chaos'];

    if (typeof chaosScript !== 'string' || chaosScript.trim().length === 0) {
      failWithGuidance(
        'scripts.test:chaos presence',
        String(chaosScript),
        'a non-empty script string',
        'Define scripts.test:chaos with strict chaos-only jest invocation.'
      );
    }

    assertIncludes(
      chaosScript,
      '--runInBand',
      'scripts.test:chaos strictness',
      'Add --runInBand to keep chaos execution deterministic.'
    );

    assertIncludes(
      chaosScript,
      '--detectOpenHandles',
      'scripts.test:chaos strictness',
      'Add --detectOpenHandles to catch leaked async handles in chaos tests.'
    );

    const windowsSafePatternRegex = /tests\[\\\/\]\+chaos\[\\\/\]\+\.\*\\\.test\\\.js/;
    if (!windowsSafePatternRegex.test(chaosScript)) {
      failWithGuidance(
        'scripts.test:chaos Windows-safe chaos-only pattern',
        chaosScript,
        'must contain tests[\\/]+chaos[\\/]+.*\\.test\\.js (escaped as needed)',
        'Set --testPathPattern to the exact chaos-only Windows-safe regex.'
      );
    }

    const forbiddenScriptFragments = [
      '--passWithNoTests',
      '--watch',
      '--watchAll',
      '--onlyChanged',
      '--testPathPattern="tests"',
      "--testPathPattern='tests'",
      '--testPathPattern tests',
      '--testPathPattern="."',
      "--testPathPattern='.'",
      '--testPathPattern .',
      'routes',
    ];

    for (const forbidden of forbiddenScriptFragments) {
      if (chaosScript.includes(forbidden)) {
        failWithGuidance(
          'scripts.test:chaos anti-butterfly broadening',
          chaosScript,
          `must not include ${JSON.stringify(forbidden)}`,
          'Keep test:chaos scoped to chaos tests only; remove broad or bypass flags.'
        );
      }
    }

    const jestField = pkg.jest;
    if (jestField && typeof jestField === 'object') {
      const ignorePatterns = Array.isArray(jestField.testPathIgnorePatterns) ? jestField.testPathIgnorePatterns : [];
      const testMatch = Array.isArray(jestField.testMatch) ? jestField.testMatch : [];

      for (const entry of ignorePatterns) {
        if (String(entry).includes('tests/chaos') || String(entry).includes('tests\\chaos')) {
          failWithGuidance(
            'jest.testPathIgnorePatterns anti-exclusion',
            JSON.stringify(ignorePatterns),
            'must not exclude tests/chaos',
            'Remove tests/chaos from ignore patterns.'
          );
        }
      }

      if (testMatch.length > 0) {
        const hasChaosReach = testMatch.some((entry) => String(entry).includes('chaos') || String(entry).includes('tests'));
        if (!hasChaosReach) {
          failWithGuidance(
            'jest.testMatch anti-exclusion',
            JSON.stringify(testMatch),
            'must include patterns that can match tests/chaos/*.test.js',
            'Adjust jest.testMatch so chaos tests are reachable.'
          );
        }
      }
    }

    const jestConfigCandidates = [
      'jest.config.js',
      'jest.config.cjs',
      'jest.config.mjs',
      'jest.config.ts',
    ].map((name) => path.join(REPO_ROOT, name));

    for (const configPath of jestConfigCandidates) {
      if (!fs.existsSync(configPath)) continue;
      const content = readUtf8(configPath);
      if (content.includes('tests/chaos') || content.includes('tests\\chaos')) {
        if (content.includes('testPathIgnorePatterns')) {
          failWithGuidance(
            'jest config anti-exclusion',
            `${path.basename(configPath)} contains testPathIgnorePatterns with chaos reference`,
            'no ignore patterns excluding tests/chaos',
            `Review ${path.basename(configPath)} and remove chaos exclusions explicitly.`
          );
        }
      }
    }

    if (!fs.existsSync(CHAOS_DIR)) {
      failWithGuidance(
        'chaos directory existence',
        CHAOS_DIR,
        'tests/chaos directory present',
        'Create tests/chaos and add canonical chaos test files.'
      );
    }

    const discoveredChaosFiles = fs
      .readdirSync(CHAOS_DIR)
      .filter((name) => name.endsWith('.test.js'))
      .sort();

    const expectedSorted = [...EXPECTED_CHAOS_FILES].sort();
    const extraFiles = discoveredChaosFiles.filter((file) => !expectedSorted.includes(file));
    const missingFiles = expectedSorted.filter((file) => !discoveredChaosFiles.includes(file));

    if (extraFiles.length > 0) {
      failWithGuidance(
        'chaos file allowlist drift',
        JSON.stringify(discoveredChaosFiles),
        JSON.stringify(expectedSorted),
        'New chaos test file detected; update governance allowlist/mapping intentionally.'
      );
    }

    if (missingFiles.length > 0) {
      failWithGuidance(
        'canonical chaos files missing',
        JSON.stringify(discoveredChaosFiles),
        JSON.stringify(expectedSorted),
        `Restore missing canonical file(s): ${missingFiles.join(', ')}.`
      );
    }

    const moneyFile = readUtf8(path.join(CHAOS_DIR, 'chaos.failclosed.money.test.js'));
    assertIncludes(
      moneyFile,
      '/api/orders',
      'money chaos mapping',
      'Add explicit /api/orders coverage assertions in chaos.failclosed.money.test.js.'
    );
    assertIncludes(
      moneyFile,
      '/api/payments/create-intent',
      'money chaos mapping',
      'Add explicit /api/payments/create-intent coverage assertions in chaos.failclosed.money.test.js.'
    );

    const webhooksFile = readUtf8(path.join(CHAOS_DIR, 'chaos.webhooks.antibutterfly.test.js'));
    assertIncludes(
      webhooksFile,
      '/api/webhooks/stripe',
      'webhook chaos mapping',
      'Add explicit /api/webhooks/stripe coverage assertions in chaos.webhooks.antibutterfly.test.js.'
    );
    assertIncludes(
      webhooksFile,
      '/api/webhooks/paypal',
      'webhook chaos mapping',
      'Add explicit /api/webhooks/paypal coverage assertions in chaos.webhooks.antibutterfly.test.js.'
    );

    const loggingFile = readUtf8(path.join(CHAOS_DIR, 'chaos.logging.reasoncodes.test.js'));
    assertIncludes(
      loggingFile,
      'critical_dependency_unavailable',
      'reason-code logging mapping',
      'Assert logger spy calls for critical_dependency_unavailable in chaos.logging.reasoncodes.test.js.'
    );
    assertIncludes(
      loggingFile,
      'redis_unavailable',
      'reason-code logging mapping',
      'Add explicit redis_unavailable reason-code checks in chaos.logging.reasoncodes.test.js.'
    );
    assertIncludes(
      loggingFile,
      'db_unavailable',
      'reason-code logging mapping',
      'Add explicit db_unavailable reason-code checks in chaos.logging.reasoncodes.test.js.'
    );
    assertIncludes(
      loggingFile,
      'provider_timeout',
      'reason-code logging mapping',
      'Add explicit provider_timeout reason-code checks in chaos.logging.reasoncodes.test.js.'
    );

    const onlyDetector = /\b(?:describe|it|test)\.only\s*\(/;
    for (const file of discoveredChaosFiles) {
      const content = readUtf8(path.join(CHAOS_DIR, file));
      if (onlyDetector.test(content)) {
        failWithGuidance(
          'exclusive test blocks forbidden in chaos suite',
          `${file} contains .only`,
          'no describe.only / it.only / test.only in chaos tests',
          `Remove .only from ${file} to avoid silently skipping chaos coverage.`
        );
      }
    }
  });
});