import { execSync } from 'node:child_process';

const targets = [
  { name: 'parseFloat', pattern: 'parseFloat\\s*\\(' },
  { name: 'Number-on-amount', pattern: 'Number\\s*\\([^\\n)]*amount[^\\n)]*\\)' },
  { name: 'inline-division-by-100', pattern: '/\\s*100\\b' },
  { name: 'inline-multiplication-by-100', pattern: '\\*\\s*100\\b' },
];

function scan(pattern) {
  const cmd = `rg -n --glob '!node_modules/**' --glob '!coverage/**' --glob '!tests/**' --glob '!scripts/**' \"${pattern}\" src`;
  try {
    const output = execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8').trim();
    if (!output) return [];
    return output.split('\n');
  } catch (error) {
    const out = String(error.stdout || '').trim();
    if (!out) return [];
    return out.split('\n');
  }
}

let hasFindings = false;
for (const target of targets) {
  const lines = scan(target.pattern);
  if (lines.length > 0) {
    hasFindings = true;
    console.error(`[SCAN][FAIL] ${target.name}:`);
    for (const line of lines) {
      console.error(` - ${line}`);
    }
  } else {
    console.log(`[SCAN][PASS] ${target.name}: 0 findings`);
  }
}

if (hasFindings) {
  process.exit(1);
}