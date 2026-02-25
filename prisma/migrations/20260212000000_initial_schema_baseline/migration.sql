-- Baseline schema required before EPIC-1 idempotency hardening migrations.

CREATE TYPE "Role" AS ENUM ('admin', 'customer');
CREATE TYPE "OrderStatus" AS ENUM ('pending', 'paid', 'shipped', 'cancelled');

CREATE TABLE "users" (
  "id" UUID NOT NULL,
  "email" VARCHAR(320) NOT NULL,
  "password_hash" TEXT NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'customer',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "idx_users_email" ON "users"("email");

CREATE TABLE "products" (
  "id" UUID NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "price" DECIMAL(12,2) NOT NULL,
  "stock" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "deleted_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_products_active_created_at" ON "products"("active", "created_at");
CREATE INDEX "idx_products_name" ON "products"("name");

CREATE TABLE "carts" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "carts_user_id_key" ON "carts"("user_id");
CREATE INDEX "idx_carts_user_id" ON "carts"("user_id");

CREATE TABLE "cart_items" (
  "id" UUID NOT NULL,
  "cart_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_cart_items_cart_product" ON "cart_items"("cart_id", "product_id");
CREATE INDEX "idx_cart_items_cart_id" ON "cart_items"("cart_id");
CREATE INDEX "idx_cart_items_product_id" ON "cart_items"("product_id");

CREATE TABLE "orders" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "status" "OrderStatus" NOT NULL DEFAULT 'pending',
  "total_amount" DECIMAL(12,2) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_orders_user_created_at" ON "orders"("user_id", "created_at");
CREATE INDEX "idx_orders_status_created_at" ON "orders"("status", "created_at");

CREATE TABLE "order_items" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit_price" DECIMAL(12,2) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_order_items_order_product" ON "order_items"("order_id", "product_id");
CREATE INDEX "idx_order_items_order_id" ON "order_items"("order_id");
CREATE INDEX "idx_order_items_product_id" ON "order_items"("product_id");

CREATE TABLE "leads" (
  "id" UUID NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "email" VARCHAR(320) NOT NULL,
  "message" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_leads_created_at" ON "leads"("created_at");
CREATE INDEX "idx_leads_email" ON "leads"("email");

CREATE TABLE "analytics_events" (
  "id" UUID NOT NULL,
  "event_type" VARCHAR(100) NOT NULL,
  "user_id" UUID,
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_analytics_events_type_created_at" ON "analytics_events"("event_type", "created_at");
CREATE INDEX "idx_analytics_events_user_created_at" ON "analytics_events"("user_id", "created_at");

ALTER TABLE "carts"
  ADD CONSTRAINT "carts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cart_items"
  ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "cart_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "analytics_events"
  ADD CONSTRAINT "analytics_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;