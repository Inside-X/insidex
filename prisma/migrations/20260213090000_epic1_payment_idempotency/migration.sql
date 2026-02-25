-- EPIC-1 payment idempotency and webhook deduplication hardening
DO $$
BEGIN
  IF to_regclass('public.orders') IS NULL THEN
    RAISE EXCEPTION 'Expected table orders missing at this migration step; check migration order.';
  END IF;
END
$$;

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "idempotency_key" VARCHAR(128),
  ADD COLUMN IF NOT EXISTS "stripe_payment_intent_id" VARCHAR(255);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'idempotency_key'
  ) THEN
    UPDATE "orders"
    SET "idempotency_key" = CONCAT('legacy-', "id"::text)
    WHERE "idempotency_key" IS NULL;
  END IF;
END
$$;

ALTER TABLE "orders"
  ALTER COLUMN "idempotency_key" SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE "orders"
    ADD CONSTRAINT "orders_idempotency_key_key" UNIQUE ("idempotency_key");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "orders"
    ADD CONSTRAINT "orders_stripe_payment_intent_id_key" UNIQUE ("stripe_payment_intent_id");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.payment_webhook_events') IS NULL THEN
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
  ELSE
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'payment_webhook_events'
      GROUP BY c.table_schema, c.table_name
      HAVING COUNT(*) FILTER (WHERE c.column_name IN ('id', 'provider', 'event_id', 'order_id', 'payload', 'created_at')) < 6
    ) THEN
      RAISE EXCEPTION 'Existing payment_webhook_events table is incompatible with expected schema.';
    END IF;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "idx_payment_webhook_events_provider_created_at"
  ON "payment_webhook_events" ("provider", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_payment_webhook_events_order_id"
  ON "payment_webhook_events" ("order_id");