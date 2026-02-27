import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PACKAGE_JSON_PATH = path.join(ROOT, 'package.json');

function failInvariant(invariant, found, expected, fix) {
  throw new Error([
    `[npm-governance] ${invariant} violated.`,
    `Found: ${found}`,
    `Expected: ${expected}`,
    `How to fix: ${fix}`,
  ].join('\n'));
}

describe('npm scripts governance guard', () => {
  test('enforces strict CI-called scripts and coverage anti-butterfly constraints', () => {
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
    const scripts = pkg.scripts || {};

    const requiredScripts = ['test', 'test:coverage', 'test:coverage:ci', 'test:coverage:jest', 'test:chaos'];
    for (const scriptName of requiredScripts) {
      if (typeof scripts[scriptName] !== 'string' || !scripts[scriptName].trim()) {
        failInvariant(
          'required script existence',
          `${scriptName}=${String(scripts[scriptName])}`,
          `${scriptName} must exist and be a non-empty string`,
          `Define scripts.${scriptName} in package.json with strict non-bypass command.`
        );
      }
    }

    const gateScripts = ['test', 'test:coverage:ci', 'test:chaos'];
    const forbiddenTokens = [
      '|| true',
      '&& true',
      'exit 0',
      '--passWithNoTests',
      'continue-on-error',
      '--runTestsByPath',
      '--testNamePattern',
      '-t ',
      '--watch',
      '--watchAll',
      '--selectProjects',
      '--onlyChanged',
      '--changedSince',
    ];

    for (const scriptName of gateScripts) {
      const cmd = scripts[scriptName];
      for (const token of forbiddenTokens) {
        if (cmd.includes(token)) {
          failInvariant(
            'gate script bypass token',
            `${scriptName}: ${cmd}`,
            `${scriptName} must not include ${token}`,
            `Remove ${token} from scripts.${scriptName}; this token can weaken or bypass CI gates.`
          );
        }
      }
    }

    const chaos = scripts['test:chaos'];
    if (!chaos.includes('--runInBand') || !chaos.includes('--detectOpenHandles')) {
      failInvariant(
        'chaos script strictness flags',
        chaos,
        'test:chaos must include both --runInBand and --detectOpenHandles',
        'Add required strict flags to scripts.test:chaos for deterministic chaos execution.'
      );
    }

    if (!/tests\[\\\/\]\+chaos/.test(chaos)) {
      failInvariant(
        'chaos script scope',
        chaos,
        'test:chaos must scope to chaos tests via tests[\\/]+chaos',
        'Use a Windows-safe testPathPattern that targets only tests/chaos.'
      );
    }

    const coverageJest = scripts['test:coverage:jest'];
    if (!coverageJest.includes('--runInBand') || !coverageJest.includes('--coverage')) {
      failInvariant(
        'coverage jest strictness',
        coverageJest,
        'test:coverage:jest must include --runInBand and --coverage',
        'Add both flags to scripts.test:coverage:jest.'
      );
    }

    if (/prisma\s+(generate|migrate)|prisma:generate|prisma:migrate/.test(coverageJest)) {
      failInvariant(
        'coverage jest isolation',
        coverageJest,
        'test:coverage:jest must not include prisma generate/migrate',
        'Keep scripts.test:coverage:jest focused on Jest coverage only.'
      );
    }

    const coverageCi = scripts['test:coverage:ci'];
    if (!coverageCi.includes('node scripts/ci/run-coverage-ci.js')) {
      failInvariant(
        'coverage CI wrapper usage',
        coverageCi,
        'test:coverage:ci should call node scripts/ci/run-coverage-ci.js',
        'Set scripts.test:coverage:ci to the CI wrapper entrypoint.'
      );
    }

    if (coverageCi.includes('test:coverage:jest')) {
      failInvariant(
        'coverage CI fallback strictness',
        coverageCi,
        'test:coverage:ci must not call test:coverage:jest unconditionally',
        'Use wrapper logic to conditionally fallback only on allowlisted Prisma engine failures.'
      );
    }

    const jestConfigCandidates = [
      path.join(ROOT, 'jest.config.js'),
      path.join(ROOT, 'jest.config.cjs'),
      path.join(ROOT, 'jest.config.mjs'),
      path.join(ROOT, 'jest.config.ts'),
    ];

    let jestConfigText = '';
    for (const candidate of jestConfigCandidates) {
      if (fs.existsSync(candidate)) {
        jestConfigText = fs.readFileSync(candidate, 'utf8');
        break;
      }
    }

    const combinedConfigText = `${JSON.stringify(pkg.jest || {})}\n${jestConfigText}`;

    const broadCoverageWeakeningPatterns = [
      /!src\/\*\*(?:['",\s\]])/,
      /!src\/routes\/\*\*(?:['",\s\]])/,
      /!src\/lib\/\*\*(?:['",\s\]])/,
      /!src\/repositories\/\*\*(?:['",\s\]])/,
      /!src\/security\/\*\*(?:['",\s\]])/,
    ];

    for (const pattern of broadCoverageWeakeningPatterns) {
      const match = combinedConfigText.match(pattern);
      if (match) {
        failInvariant(
          'coverage gate weakened by broad ignore pattern',
          match[0],
          'no broad ignore pattern for core src domains',
          'Remove broad coverage ignore patterns that can hide financial/security/runtime code.'
        );
      }
    }

    const explicitAllowedCoverageIgnores = [
      '!src/validation/schemas/common.schema.js',
      '!src/validation/schemas/index.js',
    ];

    const configuredExplicitSchemaIgnores = explicitAllowedCoverageIgnores.filter((token) => combinedConfigText.includes(token));

    if (configuredExplicitSchemaIgnores.length > 0 && configuredExplicitSchemaIgnores.length !== explicitAllowedCoverageIgnores.length) {
      failInvariant(
        'coverage ignore exactness for schema barrels',
        configuredExplicitSchemaIgnores.join(', '),
        explicitAllowedCoverageIgnores.join(', '),
        'Keep schema coverage ignores exactly limited to both explicit files or remove them intentionally.'
      );
    }
  });
});