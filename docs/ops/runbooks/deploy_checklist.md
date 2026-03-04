# Deploy Checklist (Payments-Safe)

Use this checklist for deterministic deploys with minimal blast radius.

## A) Preconditions
- Confirm required env keys are present using `.env.example` as source of truth (do not hardcode secrets in docs or scripts).
- Default deploy strategy: start with `PAYMENTS_ENABLED=false`; enable only after post-deploy sanity checks pass.
- Confirm provider webhooks are configured per `docs/ops/payments.md`:
  - `POST /api/webhooks/stripe`
  - `POST /api/webhooks/paypal`
- Confirm dependencies are reachable before deploy:
  - PostgreSQL reachable
  - Redis reachable

## B) Step-by-step deploy flow (deterministic)
1. Check out pinned release SHA (no floating branch deploys).
2. Install dependencies:
   - `npm ci`
3. Generate Prisma client:
   - `npx prisma generate`
4. Apply migrations:
   - `npx prisma migrate deploy`
   - Never use `migrate dev` in production.
5. Start service with deployment supervisor/runtime.
6. Run post-deploy sanity checks (section C).
7. Only after sanity passes, flip `PAYMENTS_ENABLED=true` (if planned for this release).

## C) Post-deploy sanity checks (read-only)
- Health endpoint(s): expect healthy response.
- Static smoke:
  - `GET /` -> `200`
  - `GET /product.html` -> `200`
  - `GET /checkout.html` -> `200`
- API sanity:
  - `GET /api/cart?anonId=<uuid>` -> `200`
- Payments-disabled smoke (mandatory before enable):
  - With `PAYMENTS_ENABLED=false`, `POST /api/payments/create-intent` must return:
    - HTTP `503`
    - `error.code = "payments_disabled"`
- If enabling payments (`PAYMENTS_ENABLED=true`):
  - Do not run real payments in prod validation.
  - Validate with safe sandbox/non-charge path only: create-intent should be non-503 for valid test-safe items under approved sandbox configuration.

## D) Rollback steps
1. Immediately set `PAYMENTS_ENABLED=false`.
2. Revert application to last known-good SHA.
3. Migration safety guidance:
   - Never roll back DB migrations blindly.
   - Use forward-fix migration strategy unless DB owner approves a controlled restore plan.
   - If schema uncertainty exists: stop and escalate.
4. Restart service on known-good SHA.
5. Re-run post-deploy sanity checks (section C).

## E) Stop conditions (non-negotiable)
- Any mandatory gate fails -> `GO(prod)=NO`.
- Any drift detected after a gate -> `STOP`.
- Any uncertainty about migrations/schema state -> `STOP` and escalate.

## Safety
- Never log secrets, tokens, signatures, API keys, webhook payload secrets, or JWTs.