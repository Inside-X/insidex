-- B5.2A bounded admin stock-adjustment runtime seam
CREATE TYPE "AdminStockAdjustmentIntentClass" AS ENUM ('RECOUNT_CORRECTION', 'DAMAGE_LOSS_CORRECTION', 'AUTHORIZED_RESTORATION');
CREATE TYPE "AdminStockAdjustmentOutcomeClass" AS ENUM ('APPLIED', 'REJECTED');
CREATE TYPE "AdminStockAdjustmentRejectionClass" AS ENUM ('INVALID_INTENT', 'INVALID_TARGET', 'INVALID_PRECONDITION', 'CONFLICT_CONCURRENT_CONTRADICTION');

CREATE TABLE "admin_stock_adjustments_audit" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "target_product_id" UUID,
    "target_resolver_sku" VARCHAR(120),
    "intent_class" "AdminStockAdjustmentIntentClass" NOT NULL,
    "before_quantity" INTEGER,
    "after_quantity" INTEGER,
    "outcome_class" "AdminStockAdjustmentOutcomeClass" NOT NULL,
    "rejection_class" "AdminStockAdjustmentRejectionClass",
    "evidence_ref" VARCHAR(120),
    "note" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admin_stock_adjustments_audit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_admin_stock_adjustments_actor_created_at" ON "admin_stock_adjustments_audit"("actor_user_id", "created_at");
CREATE INDEX "idx_admin_stock_adjustments_target_created_at" ON "admin_stock_adjustments_audit"("target_product_id", "created_at");

ALTER TABLE "admin_stock_adjustments_audit"
ADD CONSTRAINT "admin_stock_adjustments_audit_target_product_id_fkey"
FOREIGN KEY ("target_product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
