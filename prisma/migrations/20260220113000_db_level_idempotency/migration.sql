-- Enforce DB-level idempotency boundaries for orders and payment webhooks.

-- Orders: scope idempotency key to user boundary.
ALTER TABLE "orders"
  DROP CONSTRAINT IF EXISTS "orders_idempotency_key_key";

ALTER TABLE "orders"
  ADD CONSTRAINT "uq_orders_user_idempotency" UNIQUE ("user_id", "idempotency_key");

-- Webhook events: dedupe by provider+event and provider+resource when available.
ALTER TABLE "payment_webhook_events"
  DROP CONSTRAINT IF EXISTS "payment_webhook_events_event_id_key";

ALTER TABLE "payment_webhook_events"
  ADD COLUMN IF NOT EXISTS "resource_id" VARCHAR(255);

ALTER TABLE "payment_webhook_events"
  ADD CONSTRAINT "uq_payment_webhook_events_provider_event" UNIQUE ("provider", "event_id");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_payment_webhook_events_provider_resource"
  ON "payment_webhook_events" ("provider", "resource_id")
  WHERE "resource_id" IS NOT NULL;