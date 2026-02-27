import fs from 'node:fs';
import path from 'node:path';

const APP_PATH = path.join(process.cwd(), 'src', 'app.js');

function failOrdering(invariant, details) {
  throw new Error([
    `[middleware-ordering] ${invariant} violated.`,
    ...details,
  ].join('\n'));
}

function indexOrFail(source, regex, tokenName) {
  const match = source.match(regex);
  if (!match || match.index === undefined) {
    failOrdering('required middleware token missing', [
      `Missing token: ${tokenName}`,
      `Regex: ${regex}`,
      'Fix: ensure src/app.js contains the required middleware wiring token.',
    ]);
  }
  return match.index;
}

describe('webhooks strict dependency middleware ordering governance guard', () => {
  test('enforces webhook strict guard ordering before body parsing and /api rate limiter', () => {
    if (!fs.existsSync(APP_PATH)) {
      failOrdering('app wiring file missing', [
        `Missing file: ${APP_PATH}`,
        'Expected: src/app.js must define middleware ordering.',
        'Fix: restore middleware wiring file path or update this guard intentionally.',
      ]);
    }

    const source = fs.readFileSync(APP_PATH, 'utf8');

    const stripeMountRegex = /app\.use\(\s*['"]\/api\/webhooks\/stripe['"]\s*,\s*webhookStrictDependencyGuard\s*,\s*express\.raw\(/m;
    const paypalMountRegex = /app\.use\(\s*['"]\/api\/webhooks\/paypal['"]\s*,\s*webhookStrictDependencyGuard\s*,\s*express\.raw\(/m;

    const stripeMountIdx = indexOrFail(source, stripeMountRegex, 'stripe webhook mount with guard-before-raw');
    const paypalMountIdx = indexOrFail(source, paypalMountRegex, 'paypal webhook mount with guard-before-raw');

    const jsonGlobalIdx = indexOrFail(source, /app\.use\(\s*express\.json\s*\(/m, 'global express.json middleware');
    const apiRateLimiterIdx = indexOrFail(source, /app\.use\(\s*['"]\/api['"]\s*,\s*apiRateLimiter\s*\)/m, 'global /api rate limiter middleware');

    const bodyParserJsonMatch = source.match(/app\.use\(\s*bodyParser\.json\s*\(/m);
    if (bodyParserJsonMatch && bodyParserJsonMatch.index !== undefined) {
      const idx = bodyParserJsonMatch.index;
      if (!(stripeMountIdx < idx && paypalMountIdx < idx)) {
        failOrdering('webhook mounts must be before bodyParser.json', [
          `Found indexes => stripeMount:${stripeMountIdx}, paypalMount:${paypalMountIdx}, bodyParser.json:${idx}`,
          'Expected => stripeMount < bodyParser.json AND paypalMount < bodyParser.json',
          'Fix: move webhook app.use mounts above app.use(bodyParser.json(...)).',
        ]);
      }
    }

    if (!(stripeMountIdx < jsonGlobalIdx && paypalMountIdx < jsonGlobalIdx)) {
      failOrdering('webhook mounts must be before global express.json', [
        `Found indexes => stripeMount:${stripeMountIdx}, paypalMount:${paypalMountIdx}, express.json:${jsonGlobalIdx}`,
        'Expected => stripeMount < express.json AND paypalMount < express.json',
        'Fix: move webhook app.use mounts above app.use(express.json(...)).',
      ]);
    }

    if (!(stripeMountIdx < apiRateLimiterIdx && paypalMountIdx < apiRateLimiterIdx)) {
      failOrdering('webhook mounts must be before global /api rate limiter', [
        `Found indexes => stripeMount:${stripeMountIdx}, paypalMount:${paypalMountIdx}, apiRateLimiter:${apiRateLimiterIdx}`,
        'Expected => stripeMount < apiRateLimiter AND paypalMount < apiRateLimiter',
        "Fix: move webhook app.use mounts above app.use('/api', apiRateLimiter).",
      ]);
    }

    const stripeSegment = source.slice(stripeMountIdx, stripeMountIdx + 260);
    const paypalSegment = source.slice(paypalMountIdx, paypalMountIdx + 260);

    const stripeGuardPos = stripeSegment.indexOf('webhookStrictDependencyGuard');
    const stripeRawPos = stripeSegment.indexOf('express.raw');
    const paypalGuardPos = paypalSegment.indexOf('webhookStrictDependencyGuard');
    const paypalRawPos = paypalSegment.indexOf('express.raw');

    if (stripeGuardPos < 0 || stripeRawPos < 0 || !(stripeGuardPos < stripeRawPos)) {
      failOrdering('stripe webhook mount argument order drift', [
        `Found segment: ${stripeSegment.replace(/\s+/g, ' ').trim()}`,
        `Positions => guard:${stripeGuardPos}, raw:${stripeRawPos}`,
        'Expected => webhookStrictDependencyGuard appears before express.raw(...) in the same app.use mount.',
        "Fix: reorder arguments to app.use('/api/webhooks/stripe', webhookStrictDependencyGuard, express.raw(...)).",
      ]);
    }

    if (paypalGuardPos < 0 || paypalRawPos < 0 || !(paypalGuardPos < paypalRawPos)) {
      failOrdering('paypal webhook mount argument order drift', [
        `Found segment: ${paypalSegment.replace(/\s+/g, ' ').trim()}`,
        `Positions => guard:${paypalGuardPos}, raw:${paypalRawPos}`,
        'Expected => webhookStrictDependencyGuard appears before express.raw(...) in the same app.use mount.',
        "Fix: reorder arguments to app.use('/api/webhooks/paypal', webhookStrictDependencyGuard, express.raw(...)).",
      ]);
    }
  });
});