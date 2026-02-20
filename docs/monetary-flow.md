# Monetary Flow Certification Checklist

## Arithmetic safety (minor units containment)
**PASS**
- Webhook settlement requires amount equality against repository order total converted to minor units before mutation (`toMinorUnits` check + early ignore on mismatch). Core guards are in Stripe and PayPal webhook paths before `markPaidFromWebhook` / `processPaymentWebhookEvent`. 【F:src/routes/webhooks.routes.js†L181-L199】【F:src/routes/webhooks.routes.js†L281-L331】
- Strict monetary ingress rejects non-string, malformed, scientific notation, NaN/Infinity-like malformed payloads. 【F:src/utils/strict-monetary-json.js†L23-L42】【F:tests/utils/strict-monetary-json.unit.test.js†L18-L37】

## Boundary safety (schema + strict monetary ingress)
**PASS**
- Request schema + strict validation rejects malformed payment/order payloads before repository mutation; webhook payload parser enforces strict monetary JSON for raw bodies. 【F:src/validation/strict-validate.middleware.js†L10-L27】【F:src/routes/webhooks.routes.js†L27-L41】
- Oversized PayPal webhook payload is rejected before parse/mutation. 【F:src/routes/webhooks.routes.js†L217-L221】【F:tests/routes/webhooks.routes.unit.test.js†L108-L133】

## Concurrency safety (replay + idempotency)
**PASS with caveat**
- Replay handling exists for webhook events (`claimEventOrIgnore`) and idempotency responses are deterministic for accepted/replay/invalid keys. 【F:src/routes/webhooks.routes.js†L54-L76】【F:tests/lib/webhook-idempotency-store.unit.test.js†L5-L60】
- Redis idempotency backend command failure is surfaced (not silently ignored). 【F:src/lib/webhook-idempotency-store.js†L42-L47】【F:tests/lib/webhook-idempotency-store.unit.test.js†L55-L60】

## Transaction safety (rollback / atomicity)
**PASS**
- Monetary mutations route through repository transaction boundaries and integration tests cover rollback/no-partial-write outcomes in stock/contention/error paths. 【F:src/repositories/order.repository.js†L98-L293】【F:tests/integration/order.repository.fintech-audit.test.js†L144-L202】
- Webhook conversion-failure path explicitly avoids repository mutation. 【F:tests/routes/webhooks.routes.unit.test.js†L135-L186】

## Failure safety (fail-closed)
**FAIL (distributed replay hardening gap)**
- Current default webhook idempotency store is in-memory fallback when no Redis client is provided; route wiring creates store without injecting Redis. In multi-instance deployments this is fail-open for cross-node replay protection. 【F:src/lib/webhook-idempotency-store.js†L32-L53】【F:src/routes/webhooks.routes.js†L43-L48】
- Minimal fix: inject a required shared Redis client into `createWebhookIdempotencyStore` at app bootstrap for webhook routes, and return `503` (fail-closed) when idempotency backend is unavailable for money routes.

## Operational commands
- New/targeted failure tests:
  - `NODE_OPTIONS=--experimental-vm-modules node ./node_modules/jest/bin/jest.js tests/lib/webhook-idempotency-store.unit.test.js --runInBand --detectOpenHandles`
  - `NODE_OPTIONS=--experimental-vm-modules node ./node_modules/jest/bin/jest.js tests/lib/refresh-token-redis-client.unit.test.js --runInBand --detectOpenHandles`
  - `NODE_OPTIONS=--experimental-vm-modules node ./node_modules/jest/bin/jest.js tests/routes/webhooks.routes.unit.test.js --runInBand`
- Full gate:
  - `NODE_OPTIONS=--experimental-vm-modules node ./node_modules/jest/bin/jest.js --coverage`

## Latest audited gate result
- Statements: `95.7%`
- Branches: `90.11%`
- Functions: `98.37%`
- Lines: `96.07%`