-- EPIC-1 payment idempotency and webhook deduplication hardening
DO $$
BEGIN
  IF to_regclass('public.orders') IS NULL THEN
    RAISE EXCEPTION 'Expected table orders missing at this migration step; check migration order.';
  END IF;
END
$$;

ALTER TABLE "orders"
  ADD COLUMN "idempotency_key" VARCHAR(128),
  ADD COLUMN "stripe_payment_intent_id" VARCHAR(255);

UPDATE "orders"
SET "idempotency_key" = CONCAT('legacy-', "id"::text)
WHERE "idempotency_key" IS NULL;

ALTER TABLE "orders"
  ALTER COLUMN "idempotency_key" SET NOT NULL;

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_idempotency_key_key" UNIQUE ("idempotency_key");

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_stripe_payment_intent_id_key" UNIQUE ("stripe_payment_intent_id");

CREATE TABLE "payment_webhook_events" (
  "id" UUID NOT NULL,
  "provider" VARCHAR(40) NOT NULL,
  "event_id" VARCHAR(255) NOT NULL,
  "order_id" UUID,
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_webhook_events_event_id_key" UNIQUE ("event_id"),
  CONSTRAINT "payment_webhook_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "idx_payment_webhook_events_provider_created_at"
  ON "payment_webhook_events" ("provider", "created_at" DESC);

CREATE INDEX "idx_payment_webhook_events_order_id"
  ON "payment_webhook_events" ("order_id");