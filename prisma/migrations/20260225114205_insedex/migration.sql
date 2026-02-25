/*
  PostgreSQL-only migration.
  Purpose: make this migration replay-safe even if earlier migrations already created
  uq_payment_webhook_events_provider_resource.

  We use DROP INDEX IF EXISTS to avoid 42P07 "relation already exists".
*/

-- DropIndex (idempotent)
DROP INDEX IF EXISTS "idx_payment_webhook_events_provider_created_at";

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "idx_payment_webhook_events_provider_created_at"
  ON "payment_webhook_events" ("provider", "created_at");

-- Ensure we never fail if the unique index already exists from earlier migrations.
DROP INDEX IF EXISTS "uq_payment_webhook_events_provider_resource";

-- Recreate with the canonical (safe) definition (nullable resource_id -> filtered unique)
CREATE UNIQUE INDEX IF NOT EXISTS "uq_payment_webhook_events_provider_resource"
  ON "payment_webhook_events" ("provider", "resource_id")
  WHERE "resource_id" IS NOT NULL;