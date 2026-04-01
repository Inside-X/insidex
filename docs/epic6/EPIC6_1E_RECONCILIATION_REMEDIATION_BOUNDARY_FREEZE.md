# EPIC-6.1E — Reconciliation / Remediation Boundary Freeze

- Type: Contract freeze (docs-only)
- Status: Frozen for EPIC-6.1E
- Date (UTC): 2026-04-01
- Canonical checkpoint reference: `main@20aa1167649e3b62260d8deefb41080a32cd9d72`

## 1) Scope and Non-Goals

This slice freezes only the contract boundary for reconciliation/remediation when stock/order/payment coordination does not converge cleanly.

In scope:
- Reconciliation/remediation boundary purpose
- Entry boundary into remediation territory
- Success-claim restrictions in unresolved territory
- Fail-closed boundary expectations
- Cross-boundary consistency requirements
- Explicit deferrals

Non-goals (explicit):
- Runtime implementation
- Repair tooling implementation
- Refund/reversal implementation
- Provider-specific payment remediation design
- Admin operations UI/workflow implementation
- Reservation/hold engine
- Fulfillment/shipping logic
- Exact state-machine implementation
- DB schema/migration design
- API payload design

## 2) Boundary Purpose

This slice exists to:
- Prevent unresolved/inconsistent stock/order/payment states from being represented as successful.
- Define the boundary between normal coordinated success and remediation territory.
- Preserve no-oversell, fail-closed, and consistency posture when clean convergence is unavailable.

## 3) Reconciliation/Remediation Entry Boundary

A case enters reconciliation/remediation territory when, at contract level, one or more of the following is true:
- Authoritative outcome cannot be cleanly established.
- Stock/order/payment views cannot be safely stated as mutually consistent.
- Prior/repeated handling cannot be reconciled safely.
- Coordinated finalization truth remains unresolved.

This slice defines boundary criteria only; it does not define concrete remediation workflows.

## 4) Success-Claim Restriction

- Business success must not be claimed once a case is in unresolved remediation territory.
- Order/payment/stock semantics must not mask unresolved inconsistency.
- Uncertain or non-converged outcomes must remain explicitly non-final.

## 5) Fail-Closed Remediation Posture

Minimum posture:
- Unresolved inconsistency blocks final success semantics.
- Remediation territory is never warning-only.
- Unresolved stock truth, identity truth, decrement truth, or coordination truth remains blocking until safely resolved.
- Severe inconsistency must not be silently downgraded into superficially successful state.

## 6) Cross-Boundary Consistency Requirement

Reconciliation/remediation boundary handling must preserve consistency across:
- Stock truth
- Order success semantics
- Payment-linked business success semantics
- Prior authoritative outcomes

At minimum:
- Remediation territory must not fork authoritative truth.
- Remediation territory must not create a second incompatible final state.
- Reconciliation/remediation handling must not weaken prior no-oversell and idempotency guarantees.

## 7) Relationship to Prior Slices

- 6.0A froze stock ownership and no-oversell baseline.
- 6.0B froze stock-bearing identity and SKU/variant interpretation.
- 6.1A froze decrement mechanics expectations.
- 6.1B froze decrement outcome vs finalization boundary semantics.
- 6.1C froze coordination strategy expectations.
- 6.1D froze idempotency/retry-safe coordination expectations.
- 6.1E freezes the boundary where cases leave normal coordinated-success territory and require reconciliation/remediation treatment.
- 6.1E does not redefine, weaken, or override prior slices.

Identity continuity rule:
- Preserve 6.0B: SKU is a resolver of variant identity, never a second stock bucket.

## 8) Relationship to Adjacent Areas

Boundary with checkout orchestration:
- Checkout orchestration remains out of scope.

Boundary with order state model:
- This slice constrains boundary semantics only; it does not design full order-state transitions.

Boundary with payment state model:
- This slice constrains consistency boundaries only; it does not redesign payment provider/state behavior.

Boundary with future refund/reversal slices:
- Refund/reversal policy and workflows remain deferred.

Boundary with future remediation tooling:
- Remediation tooling behavior remains deferred.

Boundary with future admin operational tooling:
- Admin operational tooling/workflows remain deferred.

Boundary with future fulfillment/shipping slices:
- Fulfillment/shipping behavior remains deferred.

## 9) Explicit Deferrals

Deferred to later slices:
- Concrete remediation workflow implementation
- Reconciliation tooling
- Refund/reversal workflow details
- Provider-specific payment recovery behavior
- Admin operational flows
- Exact state-machine transitions
- Persistence/storage design for remediation records
- Exact runbook/process implementation

## 10) Acceptance Checklist (PASS/FAIL)

- [ ] PASS/FAIL: Document is docs-only and implementation-neutral.
- [ ] PASS/FAIL: Entry boundary into remediation territory is explicit.
- [ ] PASS/FAIL: Unresolved remediation territory cannot be represented as successful finalization.
- [ ] PASS/FAIL: Fail-closed remediation posture is explicit and non-warning-only.
- [ ] PASS/FAIL: Cross-boundary consistency requirements prevent truth-forking and incompatible final states.
- [ ] PASS/FAIL: Prior-slice continuity (6.0A–6.1D) is explicit and non-overriding.
- [ ] PASS/FAIL: SKU remains resolver-only (not an independent second stock bucket).
- [ ] PASS/FAIL: Runtime/schema/API/UI/provider/remediation/refund/state-machine details remain deferred.
