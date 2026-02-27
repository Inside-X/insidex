import fs from 'node:fs';
import path from 'node:path';

const WORKFLOW_PATH = path.join(process.cwd(), '.github', 'workflows', 'ci.yml');

function failInvariant(invariant, found, expected, fix) {
  throw new Error([
    `[ci-governance] ${invariant} violated.`,
    `Found: ${found}`,
    `Expected: ${expected}`,
    `How to fix: ${fix}`,
  ].join('\n'));
}

describe('GitHub Actions CI workflow governance guard', () => {
  test('enforces strict 3-gate workflow without bypass drift', () => {
    if (!fs.existsSync(WORKFLOW_PATH)) {
      failInvariant(
        'workflow existence',
        WORKFLOW_PATH,
        '.github/workflows/ci.yml must exist',
        'Create .github/workflows/ci.yml with gate_tests, gate_coverage, and gate_chaos jobs.'
      );
    }

    const workflow = fs.readFileSync(WORKFLOW_PATH, 'utf8');

    if (!workflow.trim()) {
      failInvariant(
        'workflow content',
        'empty file',
        'non-empty YAML workflow definition',
        'Populate ci.yml with strict gate jobs and commands.'
      );
    }

    if (!/\bon:\s*[\s\S]*\bpush:\s*[\s\S]*\bpull_request:\s*/m.test(workflow) && !/\bon:\s*[\s\S]*\bpull_request:\s*[\s\S]*\bpush:\s*/m.test(workflow)) {
      failInvariant(
        'workflow triggers',
        'missing push/pull_request pair',
        'workflow must trigger on both push and pull_request',
        'Ensure `on:` includes both `push:` and `pull_request:`.'
      );
    }

    const requiredJobs = ['gate_tests', 'gate_coverage', 'gate_chaos'];
    for (const job of requiredJobs) {
      if (!new RegExp(`\\b${job}:`).test(workflow)) {
        failInvariant(
          'required gates',
          `missing ${job}`,
          'gate_tests, gate_coverage, gate_chaos jobs must all exist',
          `Add the missing ${job} job to .github/workflows/ci.yml.`
        );
      }
    }

    const requiredCommands = ['npm ci', 'npm test', 'npm run test:coverage:ci', 'npm run test:chaos'];
    for (const command of requiredCommands) {
      if (!workflow.includes(command)) {
        failInvariant(
          'required gate command',
          `missing command: ${command}`,
          'workflow must call strict gate commands exactly',
          `Add \`${command}\` under the appropriate gate job.`
        );
      }
    }

    if (!/actions\/setup-node@v4/.test(workflow)) {
      failInvariant(
        'node setup action version',
        'actions/setup-node@v4 not found',
        'use actions/setup-node@v4',
        'Pin setup-node to @v4 in each gate for consistency and cache support.'
      );
    }

    if (!/cache:\s*npm/.test(workflow)) {
      failInvariant(
        'npm caching safety',
        'cache: npm not found',
        'use setup-node cache: npm (or equivalent safe npm cache)',
        'Add `cache: npm` in setup-node configuration for gate jobs.'
      );
    }

    const forbiddenPatterns = [
      { regex: /--passWithNoTests/, label: '--passWithNoTests' },
      { regex: /--runTestsByPath/, label: '--runTestsByPath' },
      { regex: /\|\|\s*true/, label: '|| true' },
      { regex: /continue-on-error:\s*true/, label: 'continue-on-error: true' },
      { regex: /if:\s*always\(\)/, label: 'if: always()' },
    ];

    for (const { regex, label } of forbiddenPatterns) {
      if (regex.test(workflow)) {
        failInvariant(
          'forbidden bypass pattern',
          `contains ${label}`,
          `workflow must not contain ${label}`,
          `Remove ${label} to keep CI gates strict and fail-fast.`
        );
      }
    }

    const broadChaosPatternRegex = /--testPathPattern\s*=\s*.*\(\?!chaos\)/;
    if (broadChaosPatternRegex.test(workflow)) {
      failInvariant(
        'chaos pattern broadening',
        'contains a negative-lookahead broad testPathPattern for chaos',
        'chaos gate should run npm run test:chaos without broadening/alternate patterns',
        'Remove custom broad --testPathPattern in workflow and keep npm run test:chaos only.'
      );
    }
  });
});