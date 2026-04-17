-- B5.2B bounded replay / duplicate / new-intent classification seam
CREATE TYPE "AdminStockAdjustmentAttemptClass" AS ENUM ('NEW_INTENDED_ADJUSTMENT', 'REPLAYED_PRIOR_OUTCOME', 'DUPLICATE_REQUEST');

ALTER TABLE "admin_stock_adjustments_audit"
ADD COLUMN "request_key" VARCHAR(120),
ADD COLUMN "requested_quantity_delta" INTEGER,
ADD COLUMN "requested_expected_stock" INTEGER,
ADD COLUMN "attempt_class" "AdminStockAdjustmentAttemptClass",
ADD COLUMN "replay_of_audit_id" UUID;

UPDATE "admin_stock_adjustments_audit"
SET
  "request_key" = "id"::text,
  "requested_quantity_delta" = COALESCE("after_quantity", "before_quantity") - COALESCE("before_quantity", "after_quantity"),
  "requested_expected_stock" = COALESCE("before_quantity", 0),
  "attempt_class" = 'NEW_INTENDED_ADJUSTMENT';

ALTER TABLE "admin_stock_adjustments_audit"
ALTER COLUMN "request_key" SET NOT NULL,
ALTER COLUMN "requested_quantity_delta" SET NOT NULL,
ALTER COLUMN "requested_expected_stock" SET NOT NULL,
ALTER COLUMN "attempt_class" SET NOT NULL;

CREATE INDEX "idx_admin_stock_adjustments_actor_request_key_created_at"
ON "admin_stock_adjustments_audit"("actor_user_id", "request_key", "created_at");

ALTER TABLE "admin_stock_adjustments_audit"
ADD CONSTRAINT "admin_stock_adjustments_audit_replay_of_audit_id_fkey"
FOREIGN KEY ("replay_of_audit_id") REFERENCES "admin_stock_adjustments_audit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
