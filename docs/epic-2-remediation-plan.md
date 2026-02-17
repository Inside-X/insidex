# Epic 2 backend remediation plan (P0/P1/P2)

## P0 — Bloquant Go/No-Go
- **Secrets & fail-fast boot**: exiger `PAYMENT_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET`, `REDIS_URL`, JWT secrets au boot.
- **Auth production**: `register/login/refresh` doivent rester DB-driven + cookies HttpOnly/Secure/SameSite.
- **Webhook integrity**: Stripe timestamp drift max 5min + idempotency via `paymentWebhookEvent` unique `eventId`; PayPal secret + signature verification.
- **Rate limit distribué**: store Redis sliding-window sur `scope+ip+method+route` avec TTL.
- **Payload hard limits**: `express.json({ limit: '1mb' })` + raw limits Stripe/PayPal + Zod limits sur payloads secondaires.

## P1 — Qualité/Coverage critique
- Repositories: couvrir CRUD + erreurs Prisma normalisées pour `analytics`, `lead`, `product`, `order`.
- Routes: couvrir branches d’erreur auth/cart/leads/products/webhooks (guards, permissions, payload invalides).
- Libs externes: couvrir branches d’erreur Stripe/PayPal.
- Validation: inclure `common.schema.js` et `index.js` dans la couverture via tests ciblés.

## P2 — Robustesse scale
- Tests de charge ciblés: rafales multi-IP pour rate limit, replays webhook, edge monetary totals.
- Vérification end-to-end des effets papillon frontend: cookies + CORS + refresh flow.

## CI/CD split attendu
1. **Fast gate**: `npm run test:fast` (bloquant PR)
2. **Quality gate**: `npm run test:quality` (coverage thresholds stricts, upload artifacts)

## Check Go/No-Go
- **NO-GO** tant que les seuils coverage globaux ne sont pas atteints.
- **GO conditionnel** uniquement si:
  - tous P0 validés en runtime,
  - coverage globale >= policy,
  - tests intégration paiement/webhooks/auth stables.