# Payments Operations Runbook

## Scope
Operational procedures for payment incidents and financial integrity checks.

## 1) Refund procedure (current state)

### Current capability
- API endpoint exists: `POST /api/admin/refunds`
- Current runtime behavior is safely disabled: returns `501` with `code=refund_not_supported`.
- Reason: provider refund primitives are not implemented in backend adapters.

### Data to capture for any refund request ticket
- `orderId`
- Provider identifiers (if present in order/webhook metadata):
  - Stripe payment intent id
  - PayPal event/capture identifiers
- `correlationId` / `requestId`
- Requested reason and amount

### Temporary manual process (until primitives exist)
1. Validate admin access and fetch order timeline (`GET /api/admin/orders/:id/timeline`).
2. Confirm payment completion event chain in timeline (`fromStatus -> toStatus`).
3. Open provider console (Stripe/PayPal) and execute refund manually per finance policy.
4. Record manual action in incident/ticket with captured IDs.
5. Confirm customer communication + ledger note completed.

## 2) Dispute handling checklist

1. Identify charge/order
   - Locate `orderId`
   - Locate provider transaction identifiers
2. Verify timeline integrity
   - Retrieve `/api/admin/orders/:id/timeline`
   - Confirm status transition sequence and timestamps
3. Validate webhook path
   - Inspect logs for correlation id and `critical_dependency_unavailable`
   - Confirm no replay anomalies beyond expected `replay_detected`
4. Prepare dispute packet
   - Order details, customer metadata, payment confirmation event IDs, shipping proof
5. Escalate to finance/legal per SLA

## 3) Reconciliation basics

Daily/periodic reconciliation compares:
- Internal paid orders (`orders.status=paid`)
- `order_events` transition history (`pending -> paid` events)
- Provider-side successful captures/payments

Minimum checks:
1. Every paid order has at least one matching paid transition event.
2. Event timestamps and provider event ids are present where expected.
3. No unexplained provider captures without corresponding paid order.
4. Investigate mismatches with correlation id and webhook event ids.

## 4) Incident playbook

### A) `503` dependency unavailable patterns
- Symptoms: API returns `SERVICE_UNAVAILABLE` or webhook dependency unavailable errors.
- Check:
  - Redis availability/latency
  - Database health/connectivity
  - Provider timeout indicators
- Logs to inspect:
  - `critical_dependency_unavailable` events
  - `reasonCode` values (`db_unavailable`, redis/provider timeout variants)
  - `correlationId` / `requestId`

### B) Webhook delays and replay behavior
- Delayed webhooks are tolerated; ordering is not guaranteed.
- Duplicate webhooks should be idempotently ignored/replayed without duplicate side effects.
- Use order timeline + webhook logs to confirm single effective state transition.

### C) Forensic sources
- Admin timeline endpoint: `/api/admin/orders/:id/timeline`
- Application logs keyed by correlation id
- Provider dashboards (Stripe/PayPal)
- Ticketing/audit trail records for manual operations