# EPIC-6.1B — Runtime Decrement Outcome / Payment-Order Finalization Boundary Freeze

- Type: Contract freeze (docs-only)
- Status: Frozen for EPIC-6.1B
- Date (UTC): 2026-04-01
- Canonical checkpoint reference: `main@732868096cf6c7d92167c985549cf7da23a4c670`

## 1) Scope and Non-Goals

This slice freezes only the contract boundary between decrement outcome, order finalization, and payment-linked business finalization semantics.

In scope:
- Decrement outcome certainty requirements for successful finalization
- Order finalization boundary expectations
- Payment-order boundary consistency expectations
- Cross-boundary fail-closed rules
- Explicit deferrals

Non-goals (explicit):
- Runtime implementation
- Payment provider redesign
- Checkout redesign
- Refund/reversal mechanics
- Reservation/hold engine
- Fulfillment/shipping logic
- Admin operations UI
- Detailed state-machine implementation design
- API payload design
- DB schema/migration design

## 2) Boundary Purpose

This slice exists to:
- Define when decrement outcome is sufficiently known to allow successful finalization claims.
- Prevent false-success states across stock/order/payment boundaries.
- Preserve no-oversell and fail-closed posture through finalization boundaries.

## 3) Decrement Outcome Requirement

Minimum contract:
- Decrement outcome must be knowable enough to classify success or failure.
- Unverified decrement must not be treated as success.
- Uncertain decrement outcome must block successful finalization.
- Partial/ambiguous decrement outcome must not be collapsed into success semantics.

## 4) Order Finalization Boundary

Contract expectations:
- Order finalization must not claim success when decrement outcome is unverified or uncertain.
- Order finalization state must remain consistent with confirmed stock outcome.
- Order finalization must fail closed on stock ambiguity.
- Order finalization must not silently outrun stock confirmation.

## 5) Payment Finalization Boundary

Contract expectations:
- This slice does not redesign payment logic.
- Payment/order success semantics must not contradict decrement outcome.
- Successful business finalization must not be claimed while decrement outcome is unresolved.
- Any unresolved stock boundary must prevent a false “everything succeeded” state.

Constraints:
- No provider-specific payment behavior is designed here.
- No refund/reversal design is introduced here.

## 6) Cross-Boundary Consistency Rule

Stock outcome, order finalization, and payment-linked business success must remain mutually consistent.

At minimum:
- No stock failure with silent order success.
- No uncertain stock outcome with successful business finalization.
- No finalization semantics that mask unresolved decrement state.

## 7) Fail-Closed Cases

Finalization must be blocked when any of the following occurs:
- Decrement outcome unknown.
- Decrement outcome uncertain.
- Order target identity mismatch.
- Payment/order success claim would contradict stock outcome.
- Business finalization state cannot be stated consistently across stock/order/payment boundaries.

No warning-only fallback is permitted for these conditions.

## 8) Relationship to 6.0A / 6.0B / 6.1A

- 6.0A froze stock ownership, no-oversell baseline, and decrement posture baseline.
- 6.0B froze stock-bearing identity and product/variant/SKU interpretation.
- 6.1A froze runtime decrement mechanics expectations.
- 6.1B freezes finalization-boundary semantics applied on top of 6.0A/6.0B/6.1A.
- 6.1B does not redefine, weaken, or override 6.0A/6.0B/6.1A.

Identity continuity rule:
- SKU remains a resolver of variant identity when applicable, never a second independent stock bucket.

## 9) Relationship to Adjacent Areas

Boundary with checkout orchestration:
- Checkout sequencing is out of scope; this slice defines only finalization consistency constraints.

Boundary with order state model:
- This slice constrains order success semantics at the stock boundary but does not design full state transitions.

Boundary with payment state model:
- This slice constrains cross-boundary consistency but does not redesign payment providers or state flows.

Boundary with future reservation/hold slices:
- Reservation/hold behavior remains deferred.

Boundary with future reconciliation/remediation slices:
- Recovery/remediation tooling and policies remain deferred.

Boundary with future fulfillment/shipping slices:
- Fulfillment and shipping behavior remain out of scope.

## 10) Explicit Deferrals

Deferred to later slices:
- Concrete stock/order/payment coordination implementation
- Provider-specific payment recovery behavior
- Refund/reversal behavior
- Retry semantics
- Reconciliation/repair tooling
- Exact state-machine transitions
- Operational/admin workflows

## 11) Acceptance Checklist (PASS/FAIL)

- [ ] PASS/FAIL: Document remains docs-only and implementation-neutral.
- [ ] PASS/FAIL: Decrement outcome certainty requirement is explicit.
- [ ] PASS/FAIL: Order finalization cannot claim success on unverified/uncertain decrement.
- [ ] PASS/FAIL: Payment-order success semantics cannot contradict stock outcome.
- [ ] PASS/FAIL: Cross-boundary consistency rules prevent false-success states.
- [ ] PASS/FAIL: Fail-closed cases are explicit and warning-only fallback is excluded.
- [ ] PASS/FAIL: 6.0A/6.0B/6.1A relationship is explicit and non-overriding.
- [ ] PASS/FAIL: SKU remains resolver-only (not an independent second stock bucket).
- [ ] PASS/FAIL: Runtime/schema/API/UI/provider/refund/logistics designs remain deferred.
