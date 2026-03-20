-- Add contract-aligned published status while preserving legacy states for compatibility.
DO $$ BEGIN
  ALTER TYPE "ProductStatus" ADD VALUE IF NOT EXISTS 'published';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Add product short description persistence.
ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "short_description" TEXT;

-- Add media primary/kind persistence and make width/height optional.
DO $$ BEGIN
  CREATE TYPE "ProductImageKind" AS ENUM ('image');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "product_images"
  ADD COLUMN IF NOT EXISTS "is_primary" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "kind" "ProductImageKind" NOT NULL DEFAULT 'image';

ALTER TABLE "product_images"
  ALTER COLUMN "width" DROP NOT NULL,
  ALTER COLUMN "height" DROP NOT NULL;
