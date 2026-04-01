# EPIC-6.1D — Idempotency / Retry-Safe Decrement Coordination Freeze

- Type: Contract freeze (docs-only)
- Status: Frozen for EPIC-6.1D
- Date (UTC): 2026-04-01
- Canonical checkpoint reference: `main@20aa1167649e3b62260d8deefb41080a32cd9d72`

## 1) Scope and Non-Goals

This slice freezes only the minimum idempotency and retry-safe coordination contract for stock decrement relative to order/payment finalization.

In scope:
- Idempotency posture
- Retry-safe coordination posture
- Duplicate-success prevention rules
- Cross-boundary idempotency consistency rule
- Fail-closed uncertainty rules
- Explicit deferrals

Non-goals (explicit):
- Runtime implementation
- Exact idempotency storage design
- Provider-specific retry recovery design
- Refund/reversal implementation
- Reservation/hold engine
- Fulfillment/shipping logic
- Admin operational workflow
- Exact state-machine implementation
- API payload design
- DB schema/migration design

## 2) Idempotency Purpose

This slice exists to:
- Prevent duplicate decrement effects.
- Prevent duplicate or incompatible business success semantics.
- Make retries safe enough to preserve no-oversell and cross-boundary consistency.
- Ensure repeated attempts do not create a second stock outcome for the same intended finalization.

## 3) Idempotency Posture

Minimum contract posture:
- Repeated attempts for the same intended finalization must not produce multiple decrement effects.
- Repeated attempts must not produce contradictory success semantics across stock/order/payment boundaries.
- Idempotency is server-controlled; client-provided signals are non-authoritative on their own.
- If idempotent outcome cannot be determined safely, flow must fail closed.

## 4) Retry-Safe Coordination Posture

Minimum retry contract:
- Retries must remain safe relative to the same intended stock-bearing target.
- Retry must not create a second independent stock outcome.
- Retry must not create silent oversell or conflicting business success semantics.
- Retry may proceed only when repeated-coordination safety can be established.
- If retry safety is uncertain, progression must block.

Identity continuity requirement:
- Preserve 6.0B rule: SKU is a resolver of variant identity, never a second stock bucket.
- Retries must not retarget to a different stock-bearing identity for the same intended finalization.

## 5) Duplicate-Success Prevention

Contract expectations:
- No duplicate decrement confirmation for one intended finalization.
- No duplicate successful finalization semantics for one intended coordinated outcome.
- No second “success” when a first authoritative outcome already exists.
- No ambiguous coexistence of multiple final outcomes for the same intended finalization.

## 6) Cross-Boundary Idempotency Consistency Rule

Stock outcome, order success semantics, and payment-linked business success must remain idempotently consistent.

At minimum:
- Repeated handling of the same intended finalization must converge on one authoritative outcome.
- Retries must not fork stock/order/payment truth into incompatible states.
- Unresolved idempotency state must not be masked as success.

## 7) Fail-Closed Cases

Finalization/progression must be blocked when any of the following occurs:
- Idempotent outcome unknown.
- Retry safety unknown.
- Repeated-attempt identity mismatch.
- Repeated attempt would target a different stock-bearing identity.
- Duplicate-success semantics cannot be ruled out.
- Prior outcome cannot be reconciled safely with the current retry attempt.

No warning-only fallback is allowed for these conditions.

## 8) Relationship to 6.0A / 6.0B / 6.1A / 6.1B / 6.1C

- 6.0A froze stock ownership, no-oversell baseline, and decrement posture baseline.
- 6.0B froze stock-bearing identity and SKU/variant interpretation.
- 6.1A froze runtime decrement mechanics expectations.
- 6.1B froze decrement outcome vs order/payment finalization boundary semantics.
- 6.1C froze coordination strategy expectations.
- 6.1D freezes idempotency and retry-safe coordination expectations applied on top of those slices.
- 6.1D does not redefine, weaken, or override prior slices.

## 9) Relationship to Adjacent Areas

Boundary with checkout orchestration:
- Checkout orchestration remains out of scope for this slice.

Boundary with order state model:
- This slice constrains idempotent success semantics, not full order state modeling.

Boundary with payment state model:
- This slice constrains cross-boundary idempotent consistency, not provider/payment redesign.

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
- Concrete idempotency persistence mechanics
- Retry implementation details
- Exact deduplication storage model
- Provider-specific recovery behavior
- Reconciliation/repair tooling
- Refund/reversal workflows
- Exact state-machine transitions
- Admin operational workflows

## 11) Acceptance Checklist (PASS/FAIL)

- [ ] PASS/FAIL: Document is docs-only and implementation-neutral.
- [ ] PASS/FAIL: Idempotency posture prevents duplicate decrement effects for one intended finalization.
- [ ] PASS/FAIL: Retry-safe posture prevents silent oversell and conflicting business success semantics.
- [ ] PASS/FAIL: Repeated attempts cannot retarget another stock-bearing identity.
- [ ] PASS/FAIL: Duplicate-success prevention expectations are explicit and unambiguous.
- [ ] PASS/FAIL: Cross-boundary idempotency consistency requires one authoritative converged outcome.
- [ ] PASS/FAIL: Fail-closed cases are explicit and warning-only fallback is excluded.
- [ ] PASS/FAIL: 6.0A/6.0B/6.1A/6.1B/6.1C relationship is explicit and non-overriding.
- [ ] PASS/FAIL: Runtime/schema/API/UI/provider/recovery/refund/state-machine details remain deferred.
