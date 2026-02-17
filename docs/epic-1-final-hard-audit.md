# EPIC-1 FINAL AUDIT — Security & Reliability Hard Review

Date: 2026-02-16
Scope: `src/**`, `prisma/**`, `tests/**`, runtime config and middleware behavior.
Method: code inspection + executed test suite (`jest`) + adversarial scenario review (JWT forgery/expiry/malformed, RBAC bypass, payload abuse, concurrency, webhook abuse).

---

## Executive verdict

**NO-GO production (current state).**

Two blocking critical issues were identified:
1. **Privilege escalation at registration**: client can self-assign `admin` role at `/api/auth/register`, and that role is used directly for token issuance.
2. **Potentially unauthenticated order-state mutation webhook**: `/api/orders/webhooks/payments` can process payment events without auth when `PAYMENT_WEBHOOK_SECRET` is unset.

Secondary issues include incomplete refresh strategy and partial test coverage scope claims.

---

## 1) Authentication (JWT) — Verdict: **FAIL**

### Checked
- Signature validation is done via `jsonwebtoken.verify` with explicit `algorithms: ['HS256']`, issuer and audience checks.
- Token issuance forces `algorithm: 'HS256'` and `expiresIn`.
- Access + refresh configuration are env-driven and validated at boot-level utilities.
- Missing/malformed/expired/invalid tokens return consistent 401 on protected routes.

### Attack simulations (mental + test-backed)
- **Forged token** (wrong secret): rejected with 401.
- **Expired token**: rejected with 401.
- **Token without role**: auth succeeds but authorization fails with 403 on admin routes.
- **Malformed token**: rejected with 401.
- **No Authorization header**: rejected with 401 on protected routes.

### Failure points
- **Refresh strategy incomplete/unclear**: `/api/auth/refresh` validates refresh token but does not mint/rotate and return a new access token.
- **Sensitive webhook endpoint under `/api/orders` relies on optional shared secret (`PAYMENT_WEBHOOK_SECRET`)**; if unset, endpoint can still be invoked.

---

## 2) Authorization (RBAC) — Verdict: **FAIL**

### Checked
- `authorizeRole` middleware exists and normalizes roles.
- `/api/admin/*` routes are protected with `authenticate + requirePermission`.
- Role is read from validated token payload (`req.auth.role`) and normalized server-side.
- Checkout/order middleware prevents explicit `userId` injection.

### Failure points
- **Critical privilege escalation**: register schema accepts role enum `['admin','customer']`; register handler signs token with `req.body.role` directly. Any public caller can request admin role.
- RBAC model itself is present, but onboarding flow violates trust boundary.

---

## 3) API strict validation — Verdict: **PASS with caveats**

### Checked
- Critical schemas mostly use `.strict()`.
- Unknown fields are rejected in auth/products/cart/orders/payments/leads/analytics schemas.
- `userId` is rejected for order creation by schema and explicit middleware.
- Type safety and length constraints are broadly defined.
- Validation errors are standardized as 400 and non-verbose in strict validation middleware.

### Caveats
- Some endpoints use the non-strict middleware wrapper (`validate`) but still parse strict schemas; behavior is acceptable but inconsistent implementation style.
- In non-production environments, centralized error handler intentionally includes stack traces (expected), so production env discipline is required.

---

## 4) Persistence & PostgreSQL migration — Verdict: **PASS with caveats**

### Checked
- Prisma datasource is PostgreSQL.
- Relational model has PK/FK/unique constraints and indexes on critical fields.
- Order creation/payment paths use transactions and idempotency safeguards.
- Stock decrement uses guarded `updateMany ... stock >= quantity` pattern inside transaction.

### Caveats
- JSON is still used in some columns (`guestAddress`, analytics payloads, webhook payload) by design; acceptable, but must be constrained by schema at boundaries.
- Idempotency key uniqueness is global (not user-scoped), enabling possible cross-tenant collision/DoS scenarios.

---

## 5) Business integrity — Verdict: **FAIL**

### Checked
- Checkout access policy correctly isolates `guest` vs `customer` identities.
- Guest token claims are consistency-checked (`role=guest` <-> `isGuest=true`).
- Order creation binds `userId` to `req.auth.sub` server-side.

### Failure points
- `/api/orders/webhooks/payments` can mutate order status via event processing if optional secret is absent.
- `GET /api/orders/:id` has role check but no ownership check for customer context (future leak risk if full payload is returned later).

---

## 6) Error handling — Verdict: **PASS**

### Checked
- Centralized `error-handler` exists and normalizes status/message.
- Production mode avoids stack trace leakage in responses.
- Validation/auth/authorization codes are coherent (400/401/403 patterns).
- Structured logging exists with request correlation (`requestId`).

---

## 7) Test suite — Verdict: **FAIL (for audit requirement)**

### Checked
- Auth, RBAC, negative validation and userId injection are covered by dedicated tests.
- No skipped/todo tests found.
- Full local Jest run passes (19 suites / 146 tests).

### Failure point (requirement mismatch)
- **Cannot claim real global >90% coverage** from current config: coverage collection is scoped to validation/error-handler files, not full backend attack surface. Reported 98% is partial-scope, not end-to-end service coverage.

---

## 8) Configuration & environment — Verdict: **PASS with caveats**

### Checked
- JWT and most secrets are environment-driven.
- Boot validation enforces required JWT/CORS and payment-related env in production.
- Test mode supports isolated Prisma test doubles.

### Caveats
- `PAYMENT_WEBHOOK_SECRET` for `/api/orders/webhooks/payments` is not enforced by boot validation while route security depends on it.
- Logging uses console transport (acceptable) but ensure log retention/redaction policy operationally.

---

## 9) API attack surface — Verdict: **PASS with caveats**

### Checked
- API rate limiting present.
- Auth brute-force limiter present (`strictAuthRateLimiter`).
- Forgot/reset endpoints are non-enumerative in response semantics.
- CORS has production fail-closed behavior for wildcard/missing explicit origins.
- Security headers middleware is present (Helmet-like controls implemented manually).

### Caveats
- In-memory rate limiting is per-process and volatile (not distributed-safe).
- No dedicated account lockout / adaptive throttling / CAPTCHA flow for sustained credential stuffing.

---

## 10) Conclusion obligatoire

## Critical vulnerabilities (blocking)
1. **Self-service admin privilege escalation via registration payload role.**
2. **Payment webhook mutation endpoint potentially exposed when `PAYMENT_WEBHOOK_SECRET` is unset.**

## Medium vulnerabilities
1. Refresh token flow is verification-only; no explicit rotation/issuance strategy.
2. Order read endpoint lacks customer ownership enforcement.
3. Idempotency key uniqueness not tenant-scoped.
4. Coverage metric is partial-scope and can create false confidence.

## Recommended improvements (micro-stories)
1. Force server-side role assignment (`customer` only) in public register route; move admin creation to protected admin workflow.
2. Make `PAYMENT_WEBHOOK_SECRET` mandatory in production boot validation OR remove route if redundant with provider webhooks.
3. Implement full refresh contract (issue new access token, optional rotation + revocation semantics).
4. Enforce order ownership for customer role on `GET /api/orders/:id`.
5. Scope idempotency key by `userId` (composite unique) or derive server-side namespaced key.
6. Expand coverage instrumentation to all security-critical modules (auth, RBAC, routes, repositories, middleware).
7. Add distributed rate limiting backend (Redis) for production horizontal scale.

## Scores
- **Security score: 5.5 / 10**
- **Reliability score: 7.0 / 10**

## Final production verdict
**NO-GO** until critical issues are fixed.