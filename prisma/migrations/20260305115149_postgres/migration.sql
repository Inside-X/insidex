/*
  Warnings:

  - A unique constraint covering the columns `[provider,resource_id]` on the table `payment_webhook_events` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "uq_payment_webhook_events_provider_resource" ON "payment_webhook_events"("provider", "resource_id");