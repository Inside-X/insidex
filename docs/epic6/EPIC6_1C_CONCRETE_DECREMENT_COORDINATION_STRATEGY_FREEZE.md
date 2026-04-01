# EPIC-6.1C — Concrete Decrement Coordination Strategy Freeze

- Type: Contract freeze (docs-only)
- Status: Frozen for EPIC-6.1C
- Date (UTC): 2026-04-01
- Canonical checkpoint reference: `main@28beea70dfa3c7c41c856723dda6ada962596fe0`

## 1) Scope and Non-Goals

This slice freezes only the minimum coordination strategy contract for stock decrement relative to order/payment-linked business finalization.

In scope:
- Coordination posture
- Transaction/atomic coordination stance at contract level
- Locking/concurrency stance at contract level
- Retry posture at contract level
- Fail-closed coordination rules
- Explicit deferrals

Non-goals (explicit):
- Runtime implementation
- Provider-specific payment recovery design
- Refund/reversal implementation
- Reservation/hold engine
- Fulfillment/shipping logic
- Admin operational workflow
- Exact DB schema/transaction implementation
- Full state-machine implementation
- API payload design

## 2) Coordination Strategy Purpose

This slice exists to:
- Prevent stock/order/payment desynchronization.
- Prevent false-success finalization states.
- Make decrement coordination explicit and non-best-effort.
- Preserve no-oversell and fail-closed posture through coordinated finalization.

## 3) Coordination Posture

Minimum posture:
- Stock/order/payment coordination is server-controlled and explicit.
- Business success must not be claimed unless the coordinated stock boundary is satisfied.
- Coordination must fail closed on uncertainty.
- Coordination must not rely on client-declared success signals.
- Stock decrement remains bound to one resolved stock-bearing identity per sellable unit.

Identity continuity from 6.0B:
- SKU is a resolver of variant identity when applicable.
- SKU is never a second independent stock bucket.

## 4) Transaction / Atomic Coordination Stance

Contract-level expectations:
- Coordination must produce a knowable final outcome for decrement relative to finalization.
- Success semantics must not depend on unverified partial coordination.
- Stock/order/payment boundary must not silently diverge after attempted finalization.
- If atomic coordination cannot be established or verified, flow must fail closed.

This slice does not prescribe concrete DB transaction or locking primitives.

## 5) Locking / Concurrency Stance

Minimum contract expectations:
- Concurrent demand must not silently oversell.
- Coordination must not allow conflicting success claims on the same stock-bearing unit.
- If concurrency-control outcome is uncertain, finalization must block.
- Permissive/noisy best-effort concurrency handling is forbidden.

Implementation approach remains deferred.

## 6) Retry Posture

Minimum retry contract:
- Retry behavior must not create duplicate success semantics.
- Retry must not mask unresolved decrement uncertainty.
- Retry must not produce a second incompatible stock outcome for the same intended finalization.
- If retry safety cannot be established, flow must fail closed.

This slice does not define concrete retry or idempotency storage implementation.

## 7) Coordination Failure Posture (Fail-Closed)

Finalization must be blocked when any of the following occurs:
- Coordination outcome unknown.
- Decrement/order/payment coordination state inconsistent.
- Atomicity/verification outcome uncertain.
- Concurrency resolution uncertain.
- Retry safety uncertain.
- Resolved stock-bearing identity conflicts with attempted coordination target.

No warning-only fallback is allowed for these conditions.

## 8) Relationship to 6.0A / 6.0B / 6.1A / 6.1B

- 6.0A froze stock ownership, no-oversell baseline, and decrement posture baseline.
- 6.0B froze stock-bearing identity and SKU/variant interpretation.
- 6.1A froze runtime decrement mechanics expectations.
- 6.1B froze decrement outcome vs order/payment finalization boundary semantics.
- 6.1C freezes coordination strategy expectations that later runtime implementation must satisfy.
- 6.1C does not redefine, weaken, or override prior slices.

## 9) Relationship to Adjacent Areas

Boundary with checkout orchestration:
- Checkout sequencing/orchestration remains out of scope.

Boundary with order state model:
- This slice constrains coordination success semantics, not full state modeling.

Boundary with payment state model:
- This slice constrains consistency requirements, not provider/payment state redesign.

Boundary with future reservation/hold slices:
- Reservation/hold behavior remains deferred.

Boundary with future reconciliation/remediation slices:
- Reconciliation/remediation behavior remains deferred.

Boundary with future fulfillment/shipping slices:
- Fulfillment/shipping behavior remains deferred.

Boundary with future admin operational tooling:
- Admin operational tooling/workflows remain deferred.

## 10) Explicit Deferrals

Deferred to later slices:
- Concrete transaction implementation
- Locking mechanism details
- Retry implementation details
- Idempotency persistence mechanics
- Reconciliation/repair tooling
- Refund/reversal workflows
- Exact state-machine transitions
- Admin operational workflows

## 11) Acceptance Checklist (PASS/FAIL)

- [ ] PASS/FAIL: Document is docs-only and implementation-neutral.
- [ ] PASS/FAIL: Coordination posture is explicit, server-controlled, and fail-closed.
- [ ] PASS/FAIL: Business success requires coordinated stock boundary satisfaction.
- [ ] PASS/FAIL: Atomic coordination stance forbids unverified partial-success semantics.
- [ ] PASS/FAIL: Concurrency stance forbids conflicting success claims and silent oversell.
- [ ] PASS/FAIL: Retry stance forbids duplicate/incompatible success outcomes.
- [ ] PASS/FAIL: Fail-closed coordination cases are explicit.
- [ ] PASS/FAIL: 6.0A/6.0B/6.1A/6.1B relationship is explicit and non-overriding.
- [ ] PASS/FAIL: SKU remains resolver-only (not an independent second stock bucket).
- [ ] PASS/FAIL: Runtime/schema/API/UI/provider/recovery/refund details remain deferred.
