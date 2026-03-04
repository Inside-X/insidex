# Payments Incident Runbook

Operational use only. Keep actions deterministic and fail-closed.

## Logging and safety guardrails
- Never log or paste tokens, signatures, secrets, API keys, JWTs, or webhook payload secrets.
- Filter logs using: `event`, `correlationId`, `reasonCode`, `path`, `status`.
- Canonical evidence events:
  - `critical_dependency_unavailable`
  - `http_request_started`
  - `http_request`
  - `api_error`

## 1) Payments disabled / maintenance mode
### Symptoms
- Checkout cannot initialize payment.
- `POST /api/payments/create-intent` returns `503`.

### Confirm
1. Confirm env/config: `PAYMENTS_ENABLED=false`.
2. Confirm API response contract:
   - `error.code = "payments_disabled"`
   - HTTP `503`
3. Confirm no downstream side effects (no provider call, no order/payment writes).

### Mitigate
1. If maintenance is intentional, keep `PAYMENTS_ENABLED=false`.
2. Broadcast maintenance status to support/on-call channels.

### Verify
1. API: repeated `create-intent` calls return `503 payments_disabled`.
2. UI: checkout shows maintenance message: `Paiements indisponibles (maintenance)`.
3. Logs: `http_request` on `path=/api/payments/create-intent` with `status=503`; correlate with `correlationId`.

### Rollback
1. Set `PAYMENTS_ENABLED=true` only after dependencies/providers are healthy.
2. Re-run smoke test on `create-intent` and one webhook path.

## 2) Redis down (rate limit / refresh tokens / dependency guard)
### Symptoms
- Auth refresh and rate-limit paths unstable.
- Payment-adjacent calls may fail closed with `503`.

### Confirm
1. Check Redis health and connectivity.
2. Confirm API error contract:
   - `error.code = "dependency_unavailable"`
   - `reasonCode = "redis_unavailable"`
   - HTTP `503`
3. Check logs for `critical_dependency_unavailable` and matching `correlationId`.

### Mitigate
1. Restore Redis service/connectivity.
2. If incident persists, disable payments (`PAYMENTS_ENABLED=false`) to stop monetary side effects.

### Verify
1. Redis health checks pass.
2. `create-intent` and auth refresh stop returning redis-unavailable errors.
3. Logs show reduced `critical_dependency_unavailable` with `reasonCode=redis_unavailable`.

### Rollback
1. Revert recent Redis/network config changes.
2. Keep payments disabled until Redis stability is confirmed.

## 3) DB down
### Symptoms
- Payment create-intent and order flows return `503`.

### Confirm
1. Verify DB health/connectivity.
2. Confirm API error contract:
   - `error.code = "dependency_unavailable"`
   - `reasonCode = "db_unavailable"`
   - HTTP `503`
3. Logs: `critical_dependency_unavailable` with same `correlationId` as failing requests.

### Mitigate
1. Restore DB availability (connection pool, failover, credentials from secret manager).
2. Disable payments (`PAYMENTS_ENABLED=false`) if outage is prolonged.

### Verify
1. DB checks are healthy.
2. `create-intent` succeeds for canary checkout.
3. No lingering `db_unavailable` spike in logs.

### Rollback
1. Revert DB migration/config changes tied to outage.
2. Keep fail-closed behavior active until post-rollback verification passes.

## 4) Provider down / timeout (Stripe/PayPal)
### Symptoms
- Provider calls timeout/fail.
- Checkout fails with `503`.

### Confirm
1. Check provider status pages and app telemetry.
2. Confirm API error contract:
   - `error.code = "dependency_unavailable"`
   - `reasonCode = "provider_timeout"` (canonical provider outage reason)
   - HTTP `503`
3. Logs: `critical_dependency_unavailable` filtered by `reasonCode=provider_timeout` and `path`.

### Mitigate
1. Retry only via controlled backoff policies.
2. If outage broad, switch `PAYMENTS_ENABLED=false`.
3. Notify support that checkout is in maintenance mode.

### Verify
1. Provider health restored.
2. Canaries succeed without timeout reason codes.

### Rollback
1. Revert provider routing/config changes if introduced.
2. Re-enable payments only after sustained healthy canaries.

## 5) Webhook backlog / replay
### Symptoms
- Delayed payment status updates.
- Duplicate webhook deliveries observed.

### Confirm
1. Inspect webhook queue/backlog and provider delivery dashboards.
2. Validate idempotency invariants:
   - Event uniqueness checks applied.
   - `order_events` dedupe prevents duplicate state mutation.
3. Confirm duplicate deliveries do not produce duplicate financial side effects.

### Mitigate
1. Process backlog in controlled batches.
2. Use provider re-send/replay features with bounded windows.
3. Keep strict dependency guard enabled; do not bypass signature verification.

### Verify
1. Backlog drains.
2. Order timelines show single effective transitions per business event.
3. No duplicate order/event writes beyond idempotent replay markers.

### Rollback
1. Stop replay batch if anomaly detected.
2. Re-run from last verified checkpoint window only.

## 6) Invalid webhook signatures / spikes
### Symptoms
- Signature verification failures spike.
- Possible attack/noise pattern in webhook endpoints.

### Confirm
1. Check verification failure rates and source distribution.
2. Validate headers are present; do not copy/paste signature values.
3. Correlate with logs using `path`, `status`, `correlationId` and error events.

### Mitigate
1. Keep signature verification strict (fail closed).
2. Apply/verify rate limit controls and upstream filtering where available.
3. If noise impacts stability, disable payments temporarily (`PAYMENTS_ENABLED=false`).

### Verify
1. Signature-failure rate returns to baseline.
2. Legitimate webhook events still process successfully.

### Rollback
1. Revert temporary traffic controls only after stable baseline.
2. Keep monitoring for recurring spike patterns.

## 7) High error rate / 5xx spike
### Symptoms
- Elevated 5xx on payments/webhooks/auth-adjacent paths.

### Confirm
Quick triage checklist:
1. Scope: endpoints affected (`/api/payments/create-intent`, webhooks, auth refresh).
2. Dominant error contract: `payments_disabled` vs `dependency_unavailable` + `reasonCode`.
3. Dependency health: Redis, DB, provider status.
4. Log evidence by `event`, `path`, `status`, `reasonCode`, `correlationId`.

### Mitigate
Stop-the-bleeding steps:
1. Set `PAYMENTS_ENABLED=false`.
2. Validate `create-intent` now deterministically returns `503 payments_disabled`.
3. Keep webhook verification and dependency guards fail-closed.

### Verify
1. 5xx rate drops on payment mutation paths.
2. Maintenance response remains deterministic and side-effect free.

### Rollback
1. Re-enable payments only after dependency and provider recovery checks pass.
2. Continue elevated monitoring for one full on-call window.

## Rollback checklist
Use when a deploy degrades payments behavior.

1. Switch payments off (`PAYMENTS_ENABLED=false`).
2. Verify webhooks still fail-closed (invalid signatures rejected; dependency guard active).
3. Verify DB/Redis dependency checks still return deterministic `dependency_unavailable` reason codes when unavailable.
4. Revert to previous known-good SHA.
5. Re-run mandatory gates on rollback SHA in CI before re-enable:
   - `npm test -- --runInBand`
   - `npm run test:coverage:ci`
   - `npm run test:chaos`

## Related runbooks
- Deploy checklist: `docs/ops/runbooks/deploy_checklist.md`
- Backup/restore drill: `docs/ops/runbooks/backup_restore_drill.md`