CREATE TABLE "media_upload_sessions" (
  "id" VARCHAR(64) NOT NULL,
  "filename" VARCHAR(255) NOT NULL,
  "mime_type" VARCHAR(64) NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "sha256" VARCHAR(128),
  "upload_url" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "finalized_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "media_upload_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "media_uploaded_assets" (
  "id" UUID NOT NULL,
  "upload_id" VARCHAR(64) NOT NULL,
  "provider_asset_id" VARCHAR(128) NOT NULL,
  "url" TEXT NOT NULL,
  "mime_type" VARCHAR(64) NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "checksum_sha256" VARCHAR(128) NOT NULL,
  "asset_created_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "media_uploaded_assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "media_upload_finalize_idempotency" (
  "id" UUID NOT NULL,
  "upload_id" VARCHAR(64) NOT NULL,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "asset_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "media_upload_finalize_idempotency_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_media_upload_sessions_expires_at"
  ON "media_upload_sessions" ("expires_at");

CREATE INDEX "idx_media_uploaded_assets_upload_id"
  ON "media_uploaded_assets" ("upload_id");

CREATE UNIQUE INDEX "uq_media_uploaded_assets_upload_provider_asset"
  ON "media_uploaded_assets" ("upload_id", "provider_asset_id");

CREATE UNIQUE INDEX "uq_media_upload_finalize_upload_idempotency"
  ON "media_upload_finalize_idempotency" ("upload_id", "idempotency_key");

CREATE INDEX "idx_media_upload_finalize_asset_id"
  ON "media_upload_finalize_idempotency" ("asset_id");

ALTER TABLE "media_uploaded_assets"
  ADD CONSTRAINT "media_uploaded_assets_upload_id_fkey"
  FOREIGN KEY ("upload_id") REFERENCES "media_upload_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "media_upload_finalize_idempotency"
  ADD CONSTRAINT "media_upload_finalize_idempotency_upload_id_fkey"
  FOREIGN KEY ("upload_id") REFERENCES "media_upload_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "media_upload_finalize_idempotency"
  ADD CONSTRAINT "media_upload_finalize_idempotency_asset_id_fkey"
  FOREIGN KEY ("asset_id") REFERENCES "media_uploaded_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
