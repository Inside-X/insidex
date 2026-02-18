# Coverage Gap Analysis and Branch-First Attack Plan

Source: `coverage/coverage-summary.json` with thresholds `statements >=95`, `branches >=90`.

## Files below threshold

### Critical Security
- `lib/rate-limit-redis-store.js` (S 9.61 / B 0)
- `lib/simple-redis-client.js` (S 0 / B 0)
- `lib/stripe.js` (S 90.62 / B 84)
- `lib/paypal.js` (S 75 / B 61.11)
- `middlewares/rateLimit.js` (S 95 / B 72.22)
- `middlewares/rbac.js` (S 91.66 / B 90)
- `middlewares/authorizeRole.js` (S 84.61 / B 85.71)
- `middlewares/requirePermission.js` (S 86.66 / B 75)
- `middlewares/checkoutIdentity.js` (S 84.61 / B 83.33)
- `middlewares/payloadGuard.js` (S 85.71 / B 73.17)
- `routes/webhooks.routes.js` (S 75 / B 64)
- `routes/auth.routes.js` (S 78.12 / B 64)

### Infrastructure
- `lib/email.js` (S 57.14 / B 50)
- `middlewares/requestLogger.js` (S 83.33 / B 66.66)
- `middlewares/cookieParser.js` (S 86.66 / B 75)
- `middlewares/cors.js` (S 90 / B 73.33)

### Data Access (repositories)
- `repositories/order.repository.js` (S 50.75 / B 31.25)
- `repositories/user.repository.js` (S 65.11 / B 72.72)
- `repositories/cart.repository.js` (S 70 / B 100)
- `repositories/product.repository.js` (S 76.47 / B 100)
- `repositories/analytics.repository.js` (S 76.47 / B 100)
- `repositories/lead.repository.js` (S 76.47 / B 100)

### Business Logic
- `lib/money.js` (S 91.42 / B 72.72)
- `routes/payments.routes.js` (S 91.66 / B 70)
- `routes/orders.routes.js` (S 89.47 / B 100)

### Middleware (non-security-specific routing middleware)
- `routes/admin-example.routes.js` (S 80 / B 100)
- `routes/analytics.routes.js` (S 80 / B 100)
- `routes/cart.routes.js` (S 55.55 / B 100)
- `routes/leads.routes.js` (S 60 / B 100)
- `routes/products.routes.js` (S 71.42 / B 100)

---

## Missing path inventory (file-by-file)

> Focus is branch and failure behavior, including async rejection handling.

### Critical Security
- `lib/rate-limit-redis-store.js`
  - Missing execution paths: Redis unavailable; eval returns malformed tuple; ttl <= 0 fallback path.
  - Likely untested branches: constructor guard for missing `getRedisClient`; `redisClient` null check; ttl normalization branch.
  - Failure paths not covered: `eval` throw/reject, logger fail-closed behavior, transient redis disconnects.
  - Async error scenarios: rejected `redisClient.eval`, timeout/cancellation during request burst.
- `lib/simple-redis-client.js`
  - Missing execution paths: lazy init, reconnect lifecycle, circuit-open/circuit-close transitions.
  - Likely untested branches: env-missing config, optional TLS/auth config, healthy/unhealthy probe results.
  - Failure paths not covered: connect/auth failures, command failures post-connect, close/dispose with pending requests.
  - Async error scenarios: concurrent init race, event emitter `error` and `end` callbacks during in-flight command.
- `lib/stripe.js`
  - Missing execution paths: missing secret, invalid payload shape, unsupported event types.
  - Likely untested branches: signature mismatch branch, absent metadata/idempotency branch, non-success event branch.
  - Failure paths not covered: Stripe SDK throws non-validation error, serialization edge payloads.
  - Async error scenarios: webhook verification promise reject, network retries/idempotency race.
- `lib/paypal.js`
  - Missing execution paths: missing required env vars; non-OK token response; invalid token payload.
  - Likely untested branches: missing verification headers; verify endpoint non-OK; status != SUCCESS.
  - Failure paths not covered: malformed JSON response, fetch reject, auth credential corruption.
  - Async error scenarios: token call rejects, verify call rejects, chained token+verify mixed failure ordering.
- `middlewares/rateLimit.js`
  - Missing execution paths: skip/bypass logic, successful next-path with remaining quota, block-path with headers.
  - Likely untested branches: key generation fallbacks, store backend selection, standard vs legacy header behavior.
  - Failure paths not covered: store outage fail-closed/fail-open policy and logging branch.
  - Async error scenarios: async store increment rejects during request processing.
- `middlewares/rbac.js`
  - Missing execution paths: role present but unauthorized; no roles attached.
  - Likely untested branches: admin override vs strict role match.
  - Failure paths not covered: malformed role structure from token claims.
  - Async error scenarios: n/a unless role provider async wrapper exists.
- `middlewares/authorizeRole.js`
  - Missing execution paths: no authenticated user context; insufficient role.
  - Likely untested branches: single-role vs multi-role accept checks.
  - Failure paths not covered: role claim missing/null/array mismatch.
  - Async error scenarios: async next middleware throws after role gate.
- `middlewares/requirePermission.js`
  - Missing execution paths: missing permission set; permission denied response path.
  - Likely untested branches: wildcard permission handling, empty required permission array.
  - Failure paths not covered: permission claim not iterable.
  - Async error scenarios: permission resolver rejects if delegated.
- `middlewares/checkoutIdentity.js`
  - Missing execution paths: guest checkout branch vs authenticated customer branch.
  - Likely untested branches: conflicting identity claims, missing order ownership claim.
  - Failure paths not covered: malformed JWT/custom claims.
  - Async error scenarios: downstream identity lookup rejects.
- `middlewares/payloadGuard.js`
  - Missing execution paths: accepted content-type path vs rejected oversized/invalid payload.
  - Likely untested branches: boundary-size checks, string vs object payload checks.
  - Failure paths not covered: parser exceptions mapped to 4xx/5xx.
  - Async error scenarios: body parsing promise reject.
- `routes/webhooks.routes.js`
  - Missing execution paths: replay detected path; unsupported event path; order-not-found and mismatch paths.
  - Likely untested branches: stripe signature input validation; paypal verification status mapping; processable state gate.
  - Failure paths not covered: repository mark-paid throws, schema parse errors, dedupe backend unavailable.
  - Async error scenarios: concurrent duplicate events; race between claim and mark-paid.
- `routes/auth.routes.js`
  - Missing execution paths: invalid credentials, refresh token mismatch/expired/revoked, logout edge branches.
  - Likely untested branches: cookie missing vs malformed vs present, rotation success/failure branches.
  - Failure paths not covered: token store unavailable, hashing compare failure, db write failure on rotate.
  - Async error scenarios: simultaneous refresh requests causing token replay detection.

### Infrastructure
- `lib/email.js`
  - Missing execution paths: transport disabled path, template/render fallback path.
  - Likely untested branches: environment mode branch (dev noop vs prod send).
  - Failure paths not covered: SMTP/API provider error mapping.
  - Async error scenarios: provider timeout/reject and retry exhaustion.
- `middlewares/requestLogger.js`
  - Missing execution paths: success and error status logging branches.
  - Likely untested branches: correlation-id present vs generated.
  - Failure paths not covered: logger throws and middleware must not break response lifecycle.
  - Async error scenarios: async stream finish/close callbacks emitted in different order.
- `middlewares/cookieParser.js`
  - Missing execution paths: no cookie header, malformed cookie segment, signed cookie invalid.
  - Likely untested branches: decode fallback/default value branch.
  - Failure paths not covered: parser exceptions on malformed URI encoding.
  - Async error scenarios: n/a mostly sync, but downstream callback throwing not asserted.
- `middlewares/cors.js`
  - Missing execution paths: allowed origin branch, denied origin branch, no-origin branch.
  - Likely untested branches: preflight OPTIONS handling and credential toggles.
  - Failure paths not covered: bad origin resolver failure.
  - Async error scenarios: async origin callback rejects.

### Data Access
- `repositories/order.repository.js`
  - Missing execution paths: transactional create/commit happy path and rollback path, idempotent update conflict path.
  - Likely untested branches: status transition guard, already-paid/no-op branch, lookup miss branch.
  - Failure paths not covered: prisma unique violation, deadlock retry, serialization conflict.
  - Async error scenarios: transaction callback reject mid-way; partial side-effect rollback assertions absent.
- `repositories/user.repository.js`
  - Missing execution paths: user found/not found, create conflict branch, refresh token lifecycle branches.
  - Likely untested branches: optional filters and include/exclude projections.
  - Failure paths not covered: db connectivity errors; constraint failures.
  - Async error scenarios: concurrent upsert/rotate collision.
- `repositories/cart.repository.js`
  - Missing execution paths: empty cart path, add/update/remove item branches.
  - Likely untested branches: quantity boundary handling and merge vs insert behavior.
  - Failure paths not covered: product lookup failure, transaction abort.
  - Async error scenarios: concurrent cart update race.
- `repositories/product.repository.js`
  - Missing execution paths: list/filter with no rows, id miss branch.
  - Likely untested branches: pagination defaults and invalid cursor branch.
  - Failure paths not covered: db read rejection.
  - Async error scenarios: stale read vs retry behavior.
- `repositories/analytics.repository.js`
  - Missing execution paths: empty aggregate results and grouped results branch.
  - Likely untested branches: date range provided vs omitted.
  - Failure paths not covered: malformed aggregate data from db adapter.
  - Async error scenarios: long-running query timeout rejection.
- `repositories/lead.repository.js`
  - Missing execution paths: duplicate lead conflict and accepted lead branch.
  - Likely untested branches: optional source fields normalization.
  - Failure paths not covered: unique constraint/db rejection handling.
  - Async error scenarios: concurrent duplicate submissions.

### Business Logic
- `lib/money.js`
  - Missing execution paths: unsupported currency branch; fractional precision mismatch branch.
  - Likely untested branches: rounding modes and negative/zero amount handling.
  - Failure paths not covered: NaN/infinite input defensive throws.
  - Async error scenarios: n/a (pure sync), but integration callers should assert propagation.
- `routes/payments.routes.js`
  - Missing execution paths: provider unavailable, invalid order state, duplicate idempotency key.
  - Likely untested branches: paypal vs stripe selection and guard clauses.
  - Failure paths not covered: payment provider SDK/network throws.
  - Async error scenarios: async create intent/order update reject chain.
- `routes/orders.routes.js`
  - Missing execution paths: validation failure path, guest restrictions branch.
  - Likely untested branches: authenticated vs guest creation branch.
  - Failure paths not covered: repository rejection and transaction abort.
  - Async error scenarios: order creation race with inventory check.

### Middleware / thin routes
- `routes/admin-example.routes.js`
  - Missing execution paths: unauthorized access to admin endpoint.
  - Likely untested branches: route-level guard ordering.
  - Failure paths not covered: downstream handler throw.
  - Async error scenarios: async handler reject to error middleware.
- `routes/analytics.routes.js`
  - Missing execution paths: invalid query and authorization denial path.
  - Likely untested branches: query param optional branch.
  - Failure paths not covered: repository aggregation reject.
  - Async error scenarios: promise reject propagation.
- `routes/cart.routes.js`
  - Missing execution paths: empty cart return vs populated cart path.
  - Likely untested branches: add/update/delete action branches.
  - Failure paths not covered: invalid payload -> validator rejection.
  - Async error scenarios: repository update reject.
- `routes/leads.routes.js`
  - Missing execution paths: invalid body path and duplicate lead conflict.
  - Likely untested branches: optional marketing metadata.
  - Failure paths not covered: repository create rejection.
  - Async error scenarios: concurrent duplicate creation.
- `routes/products.routes.js`
  - Missing execution paths: product not found and invalid filters.
  - Likely untested branches: list vs detail endpoint paths.
  - Failure paths not covered: repository reject.
  - Async error scenarios: async pagination read failures.

---

## Strict execution attack plan (in order)

1. **Fail-closed security infrastructure first**
   - Add deep negative tests for `lib/simple-redis-client.js` and `lib/rate-limit-redis-store.js` covering unavailability, reconnect, malformed responses, and concurrent calls.
2. **Webhook authenticity + replay hardening**
   - Exhaust all `routes/webhooks.routes.js`, `lib/stripe.js`, `lib/paypal.js` negative branches: signature invalid, missing headers, bad states, mismatches, replay races.
3. **Auth/session abuse-resistance**
   - Expand `routes/auth.routes.js`, `middlewares/authorizeRole.js`, `middlewares/requirePermission.js`, `middlewares/rbac.js`, `middlewares/checkoutIdentity.js` with revocation, replay, malformed claims, concurrent refresh.
4. **Rate limiting + payload abuse controls**
   - Cover all limiter and payload guard branch paths under burst traffic and backend degradation (`middlewares/rateLimit.js`, `middlewares/payloadGuard.js`).
5. **Repository transaction correctness**
   - Build deterministic integration tests for `repositories/order.repository.js` and `repositories/user.repository.js` with rollback assertions, conflict handling, deadlock-like retries, and idempotency semantics.
6. **Remaining repositories completeness**
   - Close statement holes in cart/product/lead/analytics repositories with no-row, duplicate, and db-reject scenarios.
7. **Infrastructure middleware hardening**
   - Complete branch negatives for cookie, CORS, logger, and email adapter failover behavior.
8. **Thin route completion pass**
   - Add targeted route tests for `orders`, `payments`, `cart`, `products`, `leads`, `analytics`, and `admin-example` to hit unexecuted guards and error propagation.
9. **Enforce regression gates**
   - Add/adjust CI to fail if any touched security or repository file drops below **98/95** local target (stricter than global gate), then run full Jest coverage.

## Quality bar for test implementation
- Every branch must assert response code + structured error body + side effects (or absence).
- Async negative tests must assert logging/event hooks where applicable and guarantee awaited rejection paths.
- For repository tests, assert persisted state before/after failure to prove rollback.
- Prefer table-driven tests for branch matrices and explicit race-condition simulations with parallel promises.