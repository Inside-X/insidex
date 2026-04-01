# EPIC-6.1A — Runtime Stock Decrement Mechanics Contract Freeze

- Type: Contract freeze (docs-only)
- Status: Frozen for EPIC-6.1A
- Date (UTC): 2026-04-01
- Canonical checkpoint reference: `main@0a29aaed3070acb93a974d95abbc715507dae118`

## 1) Scope and Non-Goals

This slice freezes only the runtime decrement mechanics contract boundary.

In scope:
- When decrement is attempted
- What decrement is bound to
- Minimum atomicity/concurrency outcome expectations
- Fail-closed runtime posture
- Explicit deferrals

Non-goals (explicit):
- Runtime implementation
- Reservation/hold engine
- Shipping logic
- Admin stock UI
- Procurement/restock workflow
- Multi-location allocation logic (unless introduced by a later slice)
- Broad checkout/payment redesign
- API payload design
- DB schema/migration design

## 2) Runtime Decrement Posture

- Decrement is server-side only.
- Decrement is allowed only in approved order finalization flow.
- Decrement outcome must be deterministic enough to classify as success or failure.
- Any uncertainty in decrement outcome must fail closed.
- Client-side stock assertions are non-authoritative and cannot drive decrement acceptance.

## 3) Binding and Target Identity

Runtime decrement must be bound to:
- Exactly one resolved stock-bearing identity per sellable unit.
- The server-resolved order/checkout target identity.
- A single interpretation path (no mixed product-vs-variant-vs-SKU targeting for one unit).

Identity rule continuity from 6.0B:
- Where SKU maps to variant identity, SKU acts as a resolver of that variant target.
- SKU must not become a second parallel stock bucket independent from variant identity.

## 4) Concurrency / No-Oversell Mechanics Contract

Contract requirements:
- Concurrent demand must not produce silent oversell.
- Decrement success/failure must be knowable at finalization time.
- If concurrency outcome is uncertain, finalization must block.
- Runtime decrement cannot be best-effort.
- Partial or uncertain decrement outcome must never be treated as successful finalization.

This freeze defines outcome guarantees only; it does not prescribe concrete DB/locking implementation.

## 5) Atomicity / Outcome Contract

Minimum runtime outcome expectations:
- Either decrement is confirmed for the intended stock-bearing target, or finalization is not successful.
- Runtime must not silently proceed after unverified decrement.
- Finalization outcome must remain consistent with no-oversell guarantees frozen in 6.0A.

## 6) Failure Posture (Fail-Closed)

Finalization must be blocked when any of the following occurs:
- Stock-bearing identity ambiguous.
- Stock truth unavailable, stale, or unverifiable.
- Decrement result uncertain.
- Concurrency result uncertain.
- Target mismatch between resolved sellable identity and decrement target.
- Attempted decrement against unresolved or conflicting sellable identity.

No warning-only fallback is permitted for these conditions.

## 7) Relationship to 6.0A and 6.0B

- 6.0A froze stock ownership, no-oversell, and decrement posture baseline.
- 6.0B froze stock-bearing identity and product/variant/SKU interpretation.
- 6.1A freezes runtime decrement mechanics expectations applied on top of 6.0A/6.0B.
- 6.1A does not redefine, weaken, or override 6.0A or 6.0B.

## 8) Relationship to Adjacent Areas

Boundary with checkout/order orchestration:
- Checkout/order orchestration controls process flow; this slice only constrains decrement mechanics expectations.

Boundary with payment finalization:
- This slice does not alter payment logic; it defines stock-decrement outcome requirements required for successful finalization.

Boundary with future reservation/hold behavior:
- Reservation/hold semantics remain deferred.

Boundary with delivery/shipping:
- No shipping/carrier/fulfillment pricing behavior is defined here.

Boundary with admin stock operations:
- No admin operational workflow/UI contract is defined here.

## 9) Explicit Deferrals

Deferred to later slices:
- Concrete transaction strategy
- Locking mechanism details
- Reservation/hold behavior
- Retry semantics
- Reconciliation/repair tooling
- Admin operational tooling
- Warehouse/location-specific logic

## 10) Acceptance Checklist (PASS/FAIL)

- [ ] PASS/FAIL: Document is docs-only and implementation-neutral.
- [ ] PASS/FAIL: Runtime decrement posture is server-side, deterministic, and fail-closed.
- [ ] PASS/FAIL: Decrement binding requires one resolved stock-bearing identity per sellable unit.
- [ ] PASS/FAIL: SKU remains a resolver of variant identity (not an independent second stock bucket).
- [ ] PASS/FAIL: Concurrency/no-oversell mechanics contract blocks uncertain outcomes.
- [ ] PASS/FAIL: Atomicity/outcome contract forbids successful finalization after unverified decrement.
- [ ] PASS/FAIL: Failure cases are explicit and fail-closed.
- [ ] PASS/FAIL: Runtime/schema/API/UI/logistics details remain deferred.
