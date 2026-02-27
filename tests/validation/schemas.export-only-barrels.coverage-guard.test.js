import { describe, test, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

import jestConfig from '../../jest.config.js';

const SCHEMAS_DIR = path.resolve('src/validation/schemas');
const toPosixPath = (relativePath) => relativePath.replaceAll('\\', '/');

const EXPECTED_ALLOWLIST = [
  'src/validation/schemas/common.schema.js',
  'src/validation/schemas/index.js',
];
const ALLOWLIST = EXPECTED_ALLOWLIST.map(toPosixPath);
const EXACT_COVERAGE_EXCLUSIONS = ALLOWLIST.map((filePath) => `!${filePath}`);

function listSchemaJsFiles(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...listSchemaJsFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

function isExportOnlyBarrel(source) {
  const withoutComments = stripComments(source);
  const statements = withoutComments
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (statements.length === 0) {
    return false;
  }

  const allowedStatementPatterns = [
    /^export\s*\{[^}]*\}\s*(from\s*['"][^'"]+['"])?\s*;?$/,
    /^export\s*\*\s*from\s*['"][^'"]+['"]\s*;?$/,
    /^export\s+default\s+.+;?$/,
  ];

  return statements.every((statement) =>
    allowedStatementPatterns.some((pattern) => pattern.test(statement)),
  );
}

describe('coverage guard for export-only schema barrels', () => {
  test('requires explicit coverage exclusion decisions for export-only barrels', () => {
    const schemaFiles = listSchemaJsFiles(SCHEMAS_DIR)
      .map((absolutePath) => toPosixPath(path.relative(process.cwd(), absolutePath)))
      .sort();

    const exportOnlyBarrels = schemaFiles.filter((relativePath) => {
      const source = fs.readFileSync(relativePath, 'utf8');
      return isExportOnlyBarrel(source);
    });

    const unexpectedBarrels = exportOnlyBarrels.filter(
      (relativePath) => !ALLOWLIST.includes(relativePath),
    );
    if (unexpectedBarrels.length > 0) {
      throw new Error(
        unexpectedBarrels
          .map(
            (relativePath) =>
              `New export-only barrel detected: ${relativePath}. Decide explicitly: add it to coverage exclusion allowlist (config) OR add executable statements (not allowed here).`,
          )
          .join('\n'),
      );
    }
  });

  test('allowlisted export-only barrels are excluded from coverage via exact paths', () => {
    expect(ALLOWLIST).toEqual(EXPECTED_ALLOWLIST.map(toPosixPath));

    const collectCoverageFrom = (jestConfig.collectCoverageFrom ?? []).map(toPosixPath);

    for (const exclusion of EXACT_COVERAGE_EXCLUSIONS) {
      expect(collectCoverageFrom).toContain(exclusion);
    }

    const broadSchemaExclusions = collectCoverageFrom.filter(
      (entry) =>
        entry.startsWith('!src/validation/schemas/') &&
        entry !== '!src/validation/schemas/common.schema.js' &&
        entry !== '!src/validation/schemas/index.js',
    );

    expect(broadSchemaExclusions).toEqual([]);
  });
});