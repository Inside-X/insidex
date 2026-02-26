# Monetary Flow Invariants & Failure-Mode Audit

## Hard invariants (must hold)

1. **Order can become `paid` only after provider settlement is confirmed and amount/currency match the persisted order total.**
2. **No double minor conversion** in money-critical paths.
3. **Order total is immutable after creation** (webhook paths update status only, never recompute total).
4. **Stock reservation cannot oversell under concurrency** (atomic decrement with transaction rollback).

---

## Canonical idempotency keys

- `/api/orders` creation: request `idempotencyKey` scoped by authenticated `userId`.
- `/api/payments/create-intent`: request `idempotencyKey` scoped by authenticated `userId`.
- Stripe webhook: provider `eventId` + provider resource id (`paymentIntentId`).
- PayPal webhook: provider `eventId` + provider resource id (`capture.id` / `resource.id`).

---

## Step-by-step execution flows

### 1) `POST /api/payments/create-intent`

1. Validate payload and auth.
2. Read products from DB (`product.findMany`) and compute expected order total in minor units once.
3. Generate candidate PaymentIntent id.
4. Call repository `createPendingPaymentOrder(...)`.
5. Repository transaction writes:
   - `order.create` (pending + idempotency key + total amount)
   - `product.updateMany` per line (stock decrement with `stock >= quantity` guard)
   - `orderItem.createMany`
6. Response:
   - `201` on first commit
   - `200` deterministic replay for duplicate idempotency key.

### 2) `POST /api/orders`

1. Validate payload and auth.
2. Call repository `createIdempotentWithItemsAndUpdateStock(...)`.
3. Repository transaction writes:
   - `order.create`
   - guarded stock decrements (`product.updateMany`)
   - `orderItem.createMany`
4. Response:
   - `201` first-time
   - `200` deterministic replay.

### 3) `POST /api/webhooks/stripe`

#### Success path
1. Validate Stripe signature and payload schema.
2. Accept only `payment_intent.succeeded`.
3. Replay guard by `provider+eventId` (route-level), then DB-level dedupe.
4. Load order; enforce processable state.
5. Verify `amount_received` equals order total (minor units) and currency matches.
6. Repository `markPaidFromWebhook(...)` transaction writes:
   - `paymentWebhookEvent.create(provider,eventId,resourceId,...)`
   - `order.updateMany(status -> paid)`
7. Return `200` with deterministic replay metadata.

#### Replay path
- Duplicate event/resource returns replay result (`replayed: true`) without second monetary mutation.

#### Out-of-order path
- Missing order / incompatible order state / unsupported event type is ignored or rejected fail-closed before mutation.

### 4) `POST /api/webhooks/paypal`

#### Success path
1. Parse raw payload and verify PayPal signature.
2. Replay guard by `provider+eventId` (route-level), then DB-level dedupe.
3. Load order; enforce processable state.
4. Verify amount/currency (when capture amount provided).
5. Accept only `capture.status=COMPLETED` when present.
6. Repository `processPaymentWebhookEvent(...)` transaction writes:
   - `paymentWebhookEvent.create(provider,eventId,resourceId,...)`
   - `order.updateMany(status -> paid)`
7. Return `200` with deterministic replay metadata.

#### Replay / out-of-order
- Duplicate event/resource -> replay, no second mutation.
- Non-completed / mismatched / missing-order paths fail closed or ignore before monetary mutation.

---

## DB writes and transaction boundaries

- `createIdempotentWithItemsAndUpdateStock`: all writes in one DB transaction.
- `createPendingPaymentOrder`: all writes in one DB transaction.
- `markPaidFromWebhook`: webhook-event insert + paid transition in one DB transaction.
- `processPaymentWebhookEvent`: webhook-event insert + paid transition in one DB transaction.

DB uniqueness guarantees:
- `orders`: `UNIQUE(user_id, idempotency_key)`
- `payment_webhook_events`: `UNIQUE(provider, event_id)`
- `payment_webhook_events`: partial unique index on `(provider, resource_id)` where resource is present.

---

## Failure simulations and expected fail-closed behavior

1. **DB transaction abort mid-process**
   - Expect no partial commit (no order without items, no stock-only mutation, no orphan webhook event row).
2. **Throw after provider confirmation but before marking paid**
   - Endpoint returns deterministic 5xx, order remains non-paid, retry is safe.
3. **Timeout + retry duplicate attempts**
   - First timeout fails closed, retry with same key returns one commit path and replay semantics.
4. **Concurrent checkout on limited stock**
   - Exactly one commit for available inventory, other attempts reject, stock never negative.



---

## Provider event matrix & transition rules

### Stripe

| Event type | Trusted prerequisites | Allowed order states | Transition | Action on violation |
|---|---|---|---|---|
| `payment_intent.succeeded` | Valid signature + timestamp tolerance + schema-valid payload + resource id present | `pending` | `pending -> paid` | Fail-closed (`400`) for trust errors; ignore (`200` with reason) for business mismatches |
| Any other event | Signature/schema valid | any | none | Ignore (`200`, `reason=unsupported_event_type`) |

Stripe business mismatch reason codes:
- `order_not_found`
- `order_state_incompatible`
- `amount_mismatch`
- `currency_mismatch`
- `replay_detected`

### PayPal

| Event family | Trusted prerequisites | Allowed order states | Transition | Action on violation |
|---|---|---|---|---|
| Capture completed equivalent (`capture.status=COMPLETED`) | Verification headers + signature verification success + parse/schema valid + resource id present | `pending` | `pending -> paid` | Fail-closed (`400`) for trust errors; ignore (`200` with reason) for business mismatches |
| Non-completed capture states | verification + parse/schema valid | any | none | Reject (`400`, non-terminal settlement) |

PayPal business mismatch reason codes:
- `missing_resource_id`
- `order_not_found`
- `order_state_incompatible`
- `amount_mismatch`
- `currency_mismatch`
- `replay_detected`


---

## Strict fail-closed dependency policy (production)

For money-critical routes and webhooks, unavailable critical dependencies must return `503 SERVICE_UNAVAILABLE` with **no side-effects**:

- Webhook idempotency backend unavailable in strict mode (`NODE_ENV=production` or `WEBHOOK_IDEMPOTENCY_STRICT=true`) => fail early `503` before signature verification / provider SDK calls.
- DB unavailable / transaction initialization failure on `/api/orders` or `/api/payments/create-intent` => `503`, fail closed.
- Provider SDK verification/construct operations timing out or unavailable => `503`, fail closed.
- Unexpected handler crash remains `500` (internal fault), with no paid-state mutation attempted.

Consistency targets:
- API code: `SERVICE_UNAVAILABLE` for dependency outages.
- Structured logs include reason/dependency identifiers (`critical_dependency_unavailable`, mismatch reason codes).
- Deterministic dependency reason codes for fail-closed logging: `redis_unavailable`, `db_unavailable`, `provider_timeout`, `dependency_unknown`.

## Fail-Closed Dependency Policy

### Critical dependency inventory

- `POST /api/orders`
  - Critical: Prisma/PostgreSQL connectivity and transaction begin.
  - Rule: preflight DB transaction must succeed before business computation or repository mutation.
- `POST /api/payments/create-intent`
  - Critical: Prisma/PostgreSQL connectivity and transaction begin (plus product read path).
  - Rule: preflight DB transaction must succeed before computing order totals or repository writes.
- `POST /api/webhooks/stripe`
  - Critical in strict mode: Redis idempotency backend + DB readiness.
  - Critical during provider call: Stripe SDK signature construct/verification path.
  - Rule: strict prechecks execute first and can short-circuit before reading/parsing payload-dependent data, signature verification, provider work, or mutation paths.
- `POST /api/webhooks/paypal`
  - Critical in strict mode: Redis idempotency backend + DB readiness.
  - Critical during provider call: PayPal verification SDK/network path.
  - Rule: strict prechecks execute first and can short-circuit before payload parsing/verification, provider calls, or mutation paths.
- Webhook idempotency layers
  - Critical: Redis route-level claim store in strict mode.
  - Critical: DB idempotency transaction path (`payment_webhook_events` uniqueness).

### Deterministic status-code mapping

- `503 SERVICE_UNAVAILABLE`
  - `critical_dependency_unavailable`
  - `db_unavailable`
  - `redis_unavailable`
  - `provider_timeout`
  - `provider_verify_failed_due_to_dependency`
- `400/401/403`
  - Preserved for validation/authn/authz failures and trust violations (non-infra).

### Strict mode rules

- Strict mode is enabled when `NODE_ENV=production` **or** `WEBHOOK_IDEMPOTENCY_STRICT=true`.
- In strict mode, webhook requests require healthy Redis idempotency backend and DB readiness.
- If prechecks fail, handlers immediately return `503` and skip all verification, SDK calls, and mutation logic.

### Middleware ordering invariant (webhooks)

To preserve anti-butterfly guarantees in strict mode, webhook strict dependency guard middleware must execute before any body parser and before global `/api` rate limiting:

1. `webhookStrictDependencyGuard` for `/api/webhooks/stripe` and `/api/webhooks/paypal`
2. `express.raw(...)` parser for webhook paths
3. shared middlewares
4. global `/api` rate limiter
5. webhook route handlers

Result: when strict precheck fails, requests return `503` before raw stream/body parsing, signature verification, provider SDK calls, idempotency claims, or repository mutation paths.

### Payload-agnostic early-fail anti-butterfly rule

- Early dependency-fail branches must stay payload-agnostic and O(1):
  - no payload content logs,
  - no raw-body/HMAC/signature verify work,
  - no provider SDK/network calls,
  - no queue/analytics side-effects,
  - no repository mutation or DB writes.
- Early-fail logs only include endpoint, correlation id, dependency, and reason code.