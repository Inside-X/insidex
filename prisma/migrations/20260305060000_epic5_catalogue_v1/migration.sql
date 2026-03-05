-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ProductStatus" AS ENUM ('draft', 'active', 'archived');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "StockStatus" AS ENUM ('in_stock', 'low_stock', 'out_of_stock', 'unknown');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "slug" VARCHAR(255);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "status" "ProductStatus" NOT NULL DEFAULT 'draft';
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "currency" VARCHAR(3) NOT NULL DEFAULT 'EUR';
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "stock_status" "StockStatus" NOT NULL DEFAULT 'in_stock';
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "stock_quantity" INTEGER;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "backorderable" BOOLEAN NOT NULL DEFAULT false;

UPDATE "products"
SET "slug" = CONCAT('product-', SUBSTRING(CAST("id" AS TEXT), 1, 8))
WHERE "slug" IS NULL;

UPDATE "products"
SET "stock_quantity" = "stock"
WHERE "stock_quantity" IS NULL;

ALTER TABLE "products" ALTER COLUMN "slug" SET NOT NULL;

-- CreateTable
CREATE TABLE IF NOT EXISTS "product_images" (
  "id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "url" TEXT NOT NULL,
  "alt" VARCHAR(255) NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "position" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "product_variants" (
  "id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "sku" VARCHAR(120) NOT NULL,
  "label" VARCHAR(255) NOT NULL,
  "attributes" JSONB NOT NULL DEFAULT '{}',
  "price_delta" DECIMAL(12,2),
  "absolute_price" DECIMAL(12,2),
  "stock_status" "StockStatus" NOT NULL DEFAULT 'in_stock',
  "stock_quantity" INTEGER,
  "backorderable" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "product_specs" (
  "id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "key" VARCHAR(120) NOT NULL,
  "value" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "product_specs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "products_slug_key" ON "products"("slug");
CREATE INDEX IF NOT EXISTS "idx_products_slug" ON "products"("slug");
CREATE INDEX IF NOT EXISTS "idx_products_status" ON "products"("status");
CREATE INDEX IF NOT EXISTS "idx_products_stock_status" ON "products"("stock_status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "uq_product_images_product_position" ON "product_images"("product_id", "position");
CREATE INDEX IF NOT EXISTS "idx_product_images_product_id" ON "product_images"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "product_variants_sku_key" ON "product_variants"("sku");
CREATE INDEX IF NOT EXISTS "idx_product_variants_sku" ON "product_variants"("sku");
CREATE INDEX IF NOT EXISTS "idx_product_variants_product_id" ON "product_variants"("product_id");
CREATE INDEX IF NOT EXISTS "idx_product_variants_stock_status" ON "product_variants"("stock_status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "uq_product_specs_product_key" ON "product_specs"("product_id", "key");
CREATE INDEX IF NOT EXISTS "idx_product_specs_product_position" ON "product_specs"("product_id", "position");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "product_images"
    ADD CONSTRAINT "product_images_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "product_variants"
    ADD CONSTRAINT "product_variants_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "product_specs"
    ADD CONSTRAINT "product_specs_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;