import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const STRICT_PRISMA_ENGINE_PATTERNS = [
  /\b403\s+Forbidden\b/i,
  /\bPrisma\b[^\n\r]{0,240}\bengine\b[^\n\r]{0,240}\b(?:download|fetch)\b/i,
  /\b(?:download|fetch)\b[^\n\r]{0,240}\bPrisma\b[^\n\r]{0,240}\bengine\b/i,
  /\bPrisma\s+engine\b[^\n\r]{0,240}\bchecksum\b/i,
];

export function shouldFallbackToCoverageJest(output) {
  if (typeof output !== 'string' || output.length === 0) {
    return false;
  }

  return STRICT_PRISMA_ENGINE_PATTERNS.some((pattern) => pattern.test(output));
}

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function runNpmScript(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(npmCommand(), args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    let combinedOutput = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      combinedOutput += text;
      process.stdout.write(text);
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      combinedOutput += text;
      process.stderr.write(text);
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      resolve({ code: code ?? 1, combinedOutput });
    });
  });
}

export async function runCoverageCi() {
  const primary = await runNpmScript(['run', 'test:coverage']);

  if (primary.code === 0) {
    return 0;
  }

  if (!shouldFallbackToCoverageJest(primary.combinedOutput)) {
    return primary.code;
  }

  const fallback = await runNpmScript(['run', 'test:coverage:jest']);
  return fallback.code;
}

async function main() {
  const code = await runCoverageCi();
  process.exit(code);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('[coverage:ci] runner failed unexpectedly:', error);
    process.exit(1);
  });
}