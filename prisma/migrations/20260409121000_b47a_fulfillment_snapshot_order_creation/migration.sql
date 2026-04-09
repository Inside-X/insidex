ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "local_delivery_enabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "fulfillment_mode" VARCHAR(40) NOT NULL DEFAULT 'pickup_local',
  ADD COLUMN IF NOT EXISTS "fulfillment_snapshot" JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS "idx_orders_fulfillment_mode_created_at"
  ON "orders" ("fulfillment_mode", "created_at");
