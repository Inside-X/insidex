-- Guest checkout support: users can be provisioned without password hash,
-- with a dedicated guest flag and a persisted checkout address snapshot.
ALTER TABLE "users"
  ALTER COLUMN "password_hash" DROP NOT NULL,
  ADD COLUMN "is_guest" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "guest_address" JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX "idx_users_is_guest" ON "users" ("is_guest");