import { describe, expect, test } from '@jest/globals';

import { buildNpmSpawnSpec } from '../../scripts/ci/run-coverage-ci.js';

describe('buildNpmSpawnSpec', () => {
  test('uses cmd.exe with npm args on win32', () => {
    const spec = buildNpmSpawnSpec('win32', ['run', 'test:coverage']);

    expect(spec).toEqual({
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', 'npm', 'run', 'test:coverage'],
    });
  });

  test('uses npm directly on linux', () => {
    const spec = buildNpmSpawnSpec('linux', ['run', 'test:coverage']);

    expect(spec).toEqual({
      command: 'npm',
      args: ['run', 'test:coverage'],
    });
  });

  test('uses npm directly on darwin', () => {
    const spec = buildNpmSpawnSpec('darwin', ['run', 'test:coverage:jest']);

    expect(spec).toEqual({
      command: 'npm',
      args: ['run', 'test:coverage:jest'],
    });
  });
});