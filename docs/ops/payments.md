# Payments & Webhooks Operations Guide

## Runtime env inventory (safety-focused)

| Key | Where used (file:line) | Required when | Default | Notes (safety) |
|---|---|---|---|---|
| `NODE_ENV` | `src/config/boot-validation.js:4`, `src/routes/webhooks.routes.js:53`, `src/utils/logger.js:15` | Always | `development` | `production` enables fail-fast boot validation and stricter logging defaults. |
| `LOG_FORMAT` | `src/utils/logger.js:25-26` | Optional | `json` | Never include secrets in logs; rely on redaction. |
| `DATABASE_URL` | `prisma/schema.prisma:8`, `src/config/boot-validation.js:87-89` | Always | none | Must come from secret manager in staging/prod. |
| `REDIS_URL` | `src/config/boot-validation.js:79-81`, `src/lib/refresh-token-redis-client.js:18-21` | Always | none | Required for rate limit / refresh token / idempotency backend reliability. |
| `PAYMENTS_ENABLED` | `src/config/boot-validation.js:39-41` | Optional toggle | `false` | When `true` in production, provider keys are enforced at boot. |
| `PAYMENTS_PROVIDER` | `src/config/boot-validation.js:31-36`, `src/config/boot-validation.js:43-46` | Required if `PAYMENTS_ENABLED=true` | `stripe` | Allowed values: `stripe`, `paypal`, `both`. |
| `STRIPE_SECRET` | `src/config/boot-validation.js:52-54` | Prod + payments enabled + provider includes Stripe | none | Format: `sk_live_*` (prod), `sk_test_*` (non-prod). |
| `PAYMENT_WEBHOOK_SECRET` | `src/config/boot-validation.js:48-50`, `src/routes/webhooks.routes.js:134` | Prod + payments enabled + provider includes Stripe (`stripe`/`both`) | none | Shared webhook verification secret; format `whsec_*`. |
| `PAYPAL_CLIENT_ID` | `src/config/boot-validation.js:60-62`, `src/lib/paypal.js:15` | Prod + payments enabled + provider includes PayPal | none | Do not print in logs. |
| `PAYPAL_SECRET` | `src/config/boot-validation.js:57-59`, `src/lib/paypal.js:16` | Prod + payments enabled + provider includes PayPal | none | Do not print in logs. |
| `PAYPAL_WEBHOOK_ID` | `src/config/boot-validation.js:63-65`, `src/lib/paypal.js:68` | Prod + payments enabled + provider includes PayPal | none | Required for webhook verification API call. |
| `PAYPAL_API_BASE_URL` | `src/lib/paypal.js:17`, `src/lib/paypal.js:69` | Optional | `https://api-m.paypal.com` | Use sandbox URL outside production. |
| `WEBHOOK_IDEMPOTENCY_STRICT` | `src/routes/webhooks.routes.js:53`, `src/middlewares/webhookStrictDependencyGuard.js:12` | Optional | `false` | Production is strict by default even if unset. |
| `WEBHOOK_IDEMPOTENCY_ALLOW_TEST_FALLBACK` | `src/routes/webhooks.routes.js:54` | Test-only | `false` | Never enable in production. |

## Provider toggles
- `PAYMENTS_ENABLED=(true|false)`
- `PAYMENTS_PROVIDER=(stripe|paypal|both)`

In production, boot will fail fast before serving traffic when toggles require missing provider secrets.

## Webhook endpoints and required headers
- `POST /api/webhooks/stripe`
  - Required header: `stripe-signature`
  - Required runtime secret: `PAYMENT_WEBHOOK_SECRET`
- `POST /api/webhooks/paypal`
  - Required headers: `paypal-transmission-id`, `paypal-transmission-time`, `paypal-cert-url`, `paypal-auth-algo`, `paypal-transmission-sig`
  - Required runtime config: `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`, `PAYPAL_WEBHOOK_ID`

## Environment guidance
- **dev**: use sandbox/test credentials only (`sk_test_*`, PayPal sandbox).
- **staging**: production-like toggles, but non-production provider credentials.
- **prod**: use secret manager only; never commit credential values.

## Logging safety warning
- Never log raw signatures, tokens, webhook secrets, provider secrets, or JWTs.
- Keep using the existing logger redaction behavior in `src/utils/logger.js`.