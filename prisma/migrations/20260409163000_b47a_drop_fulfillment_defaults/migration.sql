ALTER TABLE "orders"
  ALTER COLUMN "fulfillment_mode" DROP DEFAULT,
  ALTER COLUMN "fulfillment_snapshot" DROP DEFAULT;

ALTER TABLE "orders"
  DROP CONSTRAINT IF EXISTS "orders_fulfillment_mode_local_only_chk";

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_fulfillment_mode_local_only_chk"
  CHECK ("fulfillment_mode" IN ('pickup_local', 'delivery_local'));
