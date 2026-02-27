import fs from 'node:fs';
import path from 'node:path';

const RUNNER_PATH = path.join(process.cwd(), 'scripts', 'ci', 'run-coverage-ci.js');

function failInvariant(invariant, found, expected, fix) {
  throw new Error([
    `[coverage-allowlist-governance] ${invariant} violated.`,
    `Found: ${found}`,
    `Expected: ${expected}`,
    `How to fix: ${fix}`,
  ].join('\n'));
}

describe('run-coverage-ci allowlist governance', () => {
  test('enforces narrow Prisma fallback classifier and forbids broad fallback matching', () => {
    if (!fs.existsSync(RUNNER_PATH)) {
      failInvariant(
        'runner existence',
        RUNNER_PATH,
        'scripts/ci/run-coverage-ci.js must exist',
        'Restore scripts/ci/run-coverage-ci.js and keep fallback logic centralized.'
      );
    }

    const text = fs.readFileSync(RUNNER_PATH, 'utf8');

    const requiredNarrowTokens = [
      '403\\s+Forbidden',
      'Prisma',
      'engine',
      'download|fetch',
      'checksum',
      'STRICT_PRISMA_ENGINE_PATTERNS',
      'shouldFallbackToCoverageJest',
    ];

    for (const token of requiredNarrowTokens) {
      if (!text.includes(token)) {
        failInvariant(
          'narrow allowlist token presence',
          `missing token: ${token}`,
          'runner must include strict Prisma engine download/checksum allowlist signals',
          `Add strict matcher token ${token} to the fallback allowlist classifier.`
        );
      }
    }

    if (/\/prisma\/i/.test(text)) {
      failInvariant(
        'broad prisma matcher forbidden',
        '/prisma/i matcher detected',
        'no broad /prisma/i fallback matchers',
        'Use narrow multi-signal patterns (Prisma + engine + download/fetch/checksum) only.'
      );
    }

    if (/return\s+true\s*;/.test(text) && !text.includes('STRICT_PRISMA_ENGINE_PATTERNS.some')) {
      failInvariant(
        'generic fallback forbidden',
        'classifier appears to return true generically',
        'fallback must be conditional on strict allowlist pattern matches only',
        'Keep shouldFallbackToCoverageJest tied to strict pattern list and never default-true.'
      );
    }

    if (!text.includes('if (!shouldFallbackToCoverageJest(primary.combinedOutput))')) {
      failInvariant(
        'generic Jest failure fallback protection',
        'missing non-allowlisted fast-fail guard',
        'generic failures must return primary non-zero code without fallback',
        'Retain guard that exits on non-allowlisted failures before fallback.'
      );
    }
  });
});