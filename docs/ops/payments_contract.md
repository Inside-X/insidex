# Payments & Checkout API Contract (Canonical)

Purpose: freeze checkout/payment integration to reduce drift.

## 1) Endpoints and shapes

### POST `/api/payments/create-intent`
Request body (strict):
```json
{
  "idempotencyKey": "string (10..128)",
  "email": "customer@example.com",
  "address": { "line1": "...", "line2": "...", "city": "...", "postalCode": "...", "country": "..." },
  "items": [{ "id": "<uuid>", "quantity": 1 }],
  "currency": "EUR"
}
```
Rules:
- `items` must be non-empty.
- `items[].id` is UUID, `items[].quantity` is integer `1..100`.
- Unknown fields rejected.

Success:
- `201` on first write, `200` on idempotent replay.
```json
{
  "data": {
    "paymentIntentId": "pi_*",
    "clientSecret": "cs_*",
    "amount": 1234,
    "currency": "EUR",
    "customer_email": "customer@example.com",
    "metadata": {
      "orderId": "<uuid>",
      "userId": "<uuid>",
      "idempotencyKey": "same-as-request"
    }
  },
  "meta": { "replayed": false, "isGuestCheckout": false }
}
```

### POST `/api/orders`
Request body (strict):
```json
{
  "idempotencyKey": "string (10..128)",
  "stripePaymentIntentId": "pi_* (optional)",
  "email": "customer@example.com",
  "address": { "line1": "...", "line2": "...", "city": "...", "postalCode": "...", "country": "..." },
  "items": [{ "id": "<uuid>", "quantity": 1 }]
}
```
Success:
- `201` first write, `200` replay.
```json
{
  "data": { "id": "<uuid>", "status": "pending|paid|...", "items": [] },
  "meta": { "replayed": false, "isGuestCheckout": false }
}
```

### POST `/api/webhooks/stripe`
Required header: `stripe-signature`.
Body must include Stripe event fields used by validation/processing:
- `id`, `type`, `data.object.id`, `data.object.status`, `data.object.amount_received`, `data.object.currency`,
- `data.object.metadata.orderId`, `metadata.userId`, `metadata.idempotencyKey`.

Responses:
- `200` processed OR `200 { data: { ignored: true, reason: "..." } }` for tolerated no-op.
- `400 VALIDATION_ERROR` on signature/payload failure.
- `409 ORDER_INVALID_TRANSITION` for invalid state transition.
- `503 SERVICE_UNAVAILABLE` for critical dependency failure.

### POST `/api/webhooks/paypal`
Required headers:
- `paypal-transmission-id`
- `paypal-transmission-time`
- `paypal-cert-url`
- `paypal-auth-algo`
- `paypal-transmission-sig`

Request body:
```json
{
  "eventId": "string",
  "orderId": "<uuid>",
  "metadata": {
    "orderId": "<uuid>",
    "userId": "<uuid>",
    "idempotencyKey": "string (10..128)"
  },
  "payload": {}
}
```
Responses: same classes as Stripe (`200` processed/ignored, `400`, `409`, `503`).

## 2) Client non-negotiables

- Never trust client price. Client sends only `items: [{id, quantity}]` (+ customer identity/address).
- `idempotencyKey` is sent in request body for:
  - `POST /api/payments/create-intent`
  - `POST /api/orders`
- Generate one key per checkout attempt and reuse the SAME key for retries/timeouts of that attempt.
- Keep submit button disabled while request is in-flight.

## 3) Deterministic errors

### 400 `VALIDATION_ERROR`
Canonical shape:
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "requestId": "...", "details": [] } }
```

### 409 `ORDER_INVALID_TRANSITION`
Deterministic message: `Invalid order status transition`.

### 503 `SERVICE_UNAVAILABLE` (+ reasonCode expectations)
API payload remains generic (`Critical dependency unavailable` or webhook idempotency backend unavailable path).
Reason code is expected in structured logs/telemetry, not response body:
- expected values include `db_unavailable`, redis dependency code, provider timeout code,
- emitted with event `critical_dependency_unavailable` and endpoint + correlation id.

UX on 503: show retryable state, retry with SAME `idempotencyKey`.

## 4) Replay and ordering semantics

- Duplicate webhooks are tolerated and idempotently handled (`200 ignored` with replay reason where applicable).
- Provider ordering is not trusted.
- Unsupported/out-of-order events are tolerated as no-op `200 ignored` or rejected with `409 ORDER_INVALID_TRANSITION`.
- Duplicate paid side effects must not be created.

## 5) Security and observability

- Never log signatures, tokens, webhook secrets, provider secrets, or JWTs.
- Correlation propagation:
  - Accept incoming `x-correlation-id` or `x-request-id`.
  - Echo both response headers: `x-correlation-id`, `x-request-id`.
  - Include `requestId` in error payloads; include correlation id in logs.