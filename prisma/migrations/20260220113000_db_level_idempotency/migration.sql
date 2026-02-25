-- PostgreSQL-only migration; do not run in SQL Server tools.
-- Editor lint may be T-SQL; run via Prisma against PostgreSQL.

-- ---------------------------------------------------------------------------
-- Preflight validations (fail fast, no data mutation)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "orders"
    WHERE "idempotency_key" IS NOT NULL
    GROUP BY "user_id", "idempotency_key"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Migration aborted: duplicate (user_id, idempotency_key) rows exist in orders.',
      DETAIL = 'Run: SELECT "user_id", "idempotency_key", COUNT(*) AS duplicate_count FROM "orders" WHERE "idempotency_key" IS NOT NULL GROUP BY "user_id", "idempotency_key" HAVING COUNT(*) > 1 ORDER BY duplicate_count DESC, "user_id", "idempotency_key";',
      HINT = 'Resolve duplicates manually; this migration does not mutate data.';
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "payment_webhook_events"
    GROUP BY "provider", "event_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Migration aborted: duplicate (provider, event_id) rows exist in payment_webhook_events.',
      DETAIL = 'Run: SELECT "provider", "event_id", COUNT(*) AS duplicate_count FROM "payment_webhook_events" GROUP BY "provider", "event_id" HAVING COUNT(*) > 1 ORDER BY duplicate_count DESC, "provider", "event_id";',
      HINT = 'Resolve duplicates manually; this migration does not mutate data.';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Drop legacy uniqueness artifacts safely (constraint and/or index)
-- ---------------------------------------------------------------------------

ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_idempotency_key_key";
DROP INDEX IF EXISTS "orders_idempotency_key_key";

ALTER TABLE "payment_webhook_events" DROP CONSTRAINT IF EXISTS "payment_webhook_events_event_id_key";
DROP INDEX IF EXISTS "payment_webhook_events_event_id_key";

-- ---------------------------------------------------------------------------
-- Add new structures (idempotent where possible)
-- ---------------------------------------------------------------------------

ALTER TABLE "payment_webhook_events"
  ADD COLUMN IF NOT EXISTS "resource_id" VARCHAR(255);

-- Resource preflight after column exists (required for safe re-runs/new installs)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "payment_webhook_events"
    WHERE "resource_id" IS NOT NULL
    GROUP BY "provider", "resource_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Migration aborted: duplicate (provider, resource_id) rows exist where resource_id IS NOT NULL.',
      DETAIL = 'Run: SELECT "provider", "resource_id", COUNT(*) AS duplicate_count FROM "payment_webhook_events" WHERE "resource_id" IS NOT NULL GROUP BY "provider", "resource_id" HAVING COUNT(*) > 1 ORDER BY duplicate_count DESC, "provider", "resource_id";',
      HINT = 'Resolve duplicates manually; this migration does not mutate data.';
  END IF;
END
$$;

DO $$
BEGIN
  BEGIN
    ALTER TABLE "orders"
      ADD CONSTRAINT "uq_orders_user_idempotency" UNIQUE ("user_id", "idempotency_key");
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END
$$;

DO $$
BEGIN
  BEGIN
    ALTER TABLE "payment_webhook_events"
      ADD CONSTRAINT "uq_payment_webhook_events_provider_event" UNIQUE ("provider", "event_id");
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_payment_webhook_events_provider_resource"
  ON "payment_webhook_events" ("provider", "resource_id")
  WHERE "resource_id" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Post-check verification (run manually)
-- ---------------------------------------------------------------------------
-- SELECT conname, conrelid::regclass AS table_name
-- FROM pg_constraint
-- WHERE conname IN (
--   'uq_orders_user_idempotency',
--   'uq_payment_webhook_events_provider_event'
-- )
-- ORDER BY conname;
--
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE schemaname = current_schema()
--   AND indexname = 'uq_payment_webhook_events_provider_resource';