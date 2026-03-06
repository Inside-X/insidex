-- Ensure shadow DB replay does not fail when the later migration creates
-- uq_payment_webhook_events_provider_resource.
DROP INDEX IF EXISTS "uq_payment_webhook_events_provider_resource";