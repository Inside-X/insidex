-- CreateTable
CREATE TABLE IF NOT EXISTS "order_events" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "type" VARCHAR(64) NOT NULL,
  "from_status" "OrderStatus" NOT NULL,
  "to_status" "OrderStatus" NOT NULL,
  "source" VARCHAR(20) NOT NULL,
  "source_event_id" VARCHAR(255),
  "idempotency_key" VARCHAR(128),
  "correlation_id" VARCHAR(128),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_order_events_order_created_at"
  ON "order_events"("order_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "uq_order_events_order_source_event"
  ON "order_events"("order_id", "source", "source_event_id");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "order_events"
    ADD CONSTRAINT "order_events_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;