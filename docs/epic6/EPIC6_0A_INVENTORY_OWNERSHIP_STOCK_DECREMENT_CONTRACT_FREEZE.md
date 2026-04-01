# EPIC-6.0A — Inventory Ownership / Stock Decrement / No-Oversell Contract Freeze

- Type: Contract freeze (docs-only)
- Status: Frozen for EPIC-6.0A
- Date (UTC): 2026-04-01
- Canonical checkpoint reference: `main@f962c6d92372264c16d9e474a709435ebb4a9bf6`

## 1) Scope and Non-Goals

This slice freezes only the minimum inventory contract required before runtime stock decrement implementation.

In scope:
- Inventory ownership baseline (source of truth)
- Minimum allowed decrement posture
- No-oversell contractual guarantees
- Fail-closed contract posture
- Minimal stock-bearing entity definition

Non-goals (explicitly out of scope in this slice):
- Runtime implementation of decrement logic
- Reservation/hold engine
- Shipping-fee calculation
- Warehouse/network optimization
- Procurement/restock workflows
- Broad logistics architecture
- Multi-location inventory modeling (unless a later slice explicitly introduces it)
- API payload design
- DB schema/migration design
- UI/admin screen design

## 2) Inventory Ownership Baseline

- Stock truth is server-owned and server-validated.
- Client-provided stock values are non-authoritative hints only.
- Any final stock decision (availability, decrement eligibility, acceptance/rejection) must derive from server-controlled state.
- If server stock truth cannot be established, flow must fail closed.

## 3) Minimum Stock Decrement Posture

Conceptual decrement is allowed only when all of the following are true:
- Triggered by an approved server-side checkout/order finalization flow.
- Target stock-bearing entity identity is unambiguous.
- Server-side stock truth is available and current enough to evaluate the operation.
- The outcome can be deterministically recorded.

Prohibited:
- Decrement based on client assertion alone.
- Best-effort decrement with warning-only continuation.
- Proceeding when decrement outcome is uncertain.

Rule: uncertainty must block progression (fail closed).

## 4) No-Oversell Contract

Contractual guarantees for go-live-capable baseline:
- No sale may finalize unless required stock is actually available at server decision time.
- Concurrent demand must not produce silent oversell.
- If stock availability is ambiguous or unverifiable, finalization is blocked, not warned.
- If decrement success cannot be confirmed, finalization is blocked.

## 5) Product / Variant / SKU Scope

Minimum stock-bearing unit for this freeze:
- The stock-bearing entity is the sellable line-item target identified in checkout/order execution.

Interpretation rule:
- If the catalog model is product-only, stock-bearing identity is product.
- If variant/SKU identity is already present in the catalog model, that variant/SKU is the stock-bearing identity.

This slice does not introduce new entity layers.

## 6) Failure Posture (Fail-Closed Cases)

Flow must reject finalization when any of the following occurs:
- Stock truth missing.
- Stock state ambiguous/stale/unverifiable.
- Decrement outcome uncertain.
- Concurrency outcome uncertain.
- Stock-bearing target identity unclear (product/variant/SKU mismatch or unresolved identity).

No warning-only fallback is allowed for these cases.

## 7) Relationship to Adjacent Roadmap Areas

Boundary with catalogue/media:
- Catalogue/media defines sellable entities and presentation metadata.
- This slice defines only stock ownership/decrement contract posture.

Boundary with checkout/orders/payments:
- Checkout/orders/payments own orchestration and payment state transitions.
- This slice constrains when stock finalization is legally allowed in that orchestration.
- This slice does not alter payment logic.

Boundary with future delivery/shipping:
- Shipping pricing, carrier selection, and delivery execution are separate slices.
- No shipping contract expansion is introduced here.

## 8) Explicit Deferrals to Later EPIC-6 Slices

Deferred items:
- Runtime decrement mechanics (transaction strategy, locking, retry semantics)
- Reservation/hold behavior and expiration policies (if needed)
- Shipping-fee logic
- Delivery carrier logic and rate integration
- Fulfillment workflow and operational states
- Admin stock operations UI/UX

## 9) Acceptance Checklist (PASS/FAIL)

- [ ] PASS/FAIL: Document is contract-only and implementation-neutral.
- [ ] PASS/FAIL: Stock truth is explicitly server-owned.
- [ ] PASS/FAIL: Decrement allowed only in approved server-side flow.
- [ ] PASS/FAIL: No-oversell guarantee explicitly blocks unverifiable availability.
- [ ] PASS/FAIL: Fail-closed conditions are explicitly listed.
- [ ] PASS/FAIL: Product/variant/SKU stock-bearing scope is defined without over-design.
- [ ] PASS/FAIL: Shipping/logistics expansion is explicitly excluded.
- [ ] PASS/FAIL: Runtime/schema/API/UI details are explicitly deferred.
