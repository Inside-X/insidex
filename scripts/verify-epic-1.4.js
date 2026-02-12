import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execSync } from 'node:child_process';

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const checks = [];

  checks.push({
    name: 'Prisma schema present',
    pass: await fileExists('prisma/schema.prisma'),
  });

  checks.push({
    name: 'Versioned migrations present',
    pass: await fileExists('prisma/migrations/migration_lock.toml') &&
      execSync('find prisma/migrations -mindepth 1 -maxdepth 1 -type d | wc -l').toString().trim() !== '0',
  });

  const jsonRuntimeRefs = execSync(
    "rg -n \"readFile\\(|writeFile\\(|fs/promises\" src server.js --glob '!node_modules/**' || true",
  )
    .toString()
    .trim();

  checks.push({
    name: 'No JSON filesystem persistence in runtime backend code',
    pass: jsonRuntimeRefs.length === 0,
    details: jsonRuntimeRefs,
  });

  checks.push({
    name: 'Import script available',
    pass: await fileExists('scripts/import-json-to-db.js'),
  });

  checks.push({
    name: 'Legacy data/json folder removed',
    pass: !(await fileExists('data/json')),
  });

  let hasFailure = false;
  for (const check of checks) {
    const prefix = check.pass ? 'PASS' : 'FAIL';
    console.log(`[verify-epic-1.4] ${prefix} - ${check.name}`);
    if (!check.pass && check.details) {
      console.log(check.details);
    }
    if (!check.pass) {
      hasFailure = true;
    }
  }

  if (hasFailure) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('[verify-epic-1.4] FAILURE:', error.message);
  process.exit(1);
});