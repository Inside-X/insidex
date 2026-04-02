# EPIC-6.1F — Authoritative Outcome / Safe Replay / Duplicate Request / New Intended Finalization Boundary Freeze

- Type: Contract freeze (docs-only)
- Status: Frozen for EPIC-6.1F
- Date (UTC): 2026-04-02
- Canonical checkpoint reference: `main@20aa1167649e3b62260d8deefb41080a32cd9d72`

## 1) Scope and Non-Goals

This slice freezes only the contract boundary that distinguishes authoritative prior outcome, safe replay, duplicate request, and new intended finalization.

In scope:
- Boundary purpose
- Category distinctions
- Non-blurring rules
- Fail-closed posture
- Explicit deferrals

Non-goals (explicit):
- Runtime implementation
- Exact idempotency storage design
- Provider-specific payment recovery design
- Refund/reversal implementation
- Remediation tooling implementation
- Admin operational workflow
- Exact state-machine implementation
- DB schema/migration design
- API payload design

## 2) Boundary Purpose

This slice exists to:
- Prevent blurring between prior authoritative truth and new work.
- Prevent duplicate handling from creating a second stock/order/payment outcome.
- Preserve no-oversell, idempotency, and reconciliation safety.
- Ensure replay/duplicate/new-intended-finalization semantics are not conflated.

## 3) Authoritative Prior Outcome

Contract-level definition:
- A prior outcome is authoritative when it is sufficiently established to constrain subsequent handling for the same intended finalization.
- Authoritative prior outcome must not be silently contradicted by a later attempt.
- Authoritative prior outcome remains the reference point for replay/duplicate/new-intended-finalization evaluation.
- If prior outcome authority cannot be established safely, flow must fail closed.

This slice does not define storage implementation.

## 4) Safe Replay Boundary

Contract-level definition:
- Safe replay corresponds to the same intended finalization.
- Safe replay must not create a second stock outcome.
- Safe replay must not create contradictory order/payment/business-success semantics.
- Safe replay must converge on the authoritative prior outcome and must not fork it.
- If replay safety cannot be established, progression must block.

## 5) Duplicate Request Boundary

Contract-level definition:
- Duplicate request handling must not produce a second decrement effect.
- Duplicate request must not create second successful finalization semantics.
- Duplicate request must not blur into new intended finalization.
- If duplicate-vs-new cannot be safely distinguished, flow must fail closed.

## 6) New Intended Finalization Boundary

Contract-level definition:
- A new intended finalization must not be treated as replay solely due to overlapping identifiers.
- A new intended finalization must be explicitly distinguishable from safe replay/duplicate handling.
- New intended finalization must not inherit unrelated prior authoritative outcome.
- If new-vs-replay distinction cannot be safely made, progression must block.

## 7) Non-Blurring Rule (Critical)

Runtime implementation must not blur:
- Authoritative prior outcome
- Safe replay
- Duplicate request
- New intended finalization

At minimum:
- No prior authoritative outcome may be overwritten by ambiguity.
- No replay may become a second finalization.
- No duplicate may become a second stock effect.
- No new intended finalization may be collapsed into an unrelated prior outcome.

## 8) Fail-Closed Cases

Progression/finalization must be blocked when any of the following occurs:
- Prior authoritative outcome unknown.
- Replay safety unknown.
- Duplicate-vs-new distinction uncertain.
- Identity continuity across attempts unresolved.
- Prior outcome cannot be safely reconciled with current attempt.
- Repeated handling would diverge stock/order/payment truth.

No warning-only fallback is allowed for these conditions.

## 9) Relationship to Prior Slices

- 6.0A froze stock ownership and no-oversell baseline.
- 6.0B froze stock-bearing identity and SKU/variant interpretation.
- 6.1A froze runtime decrement mechanics expectations.
- 6.1B froze decrement outcome vs finalization boundary semantics.
- 6.1C froze coordination strategy expectations.
- 6.1D froze idempotency/retry-safe coordination expectations.
- 6.1E froze reconciliation/remediation boundary semantics.
- 6.1F freezes the boundary that distinguishes authoritative outcome, safe replay, duplicate request, and new intended finalization.
- 6.1F does not redefine, weaken, or override prior slices.

Identity continuity rule:
- Preserve 6.0B: SKU is a resolver of variant identity, never a second stock bucket.

## 10) Relationship to Adjacent Areas

Boundary with checkout orchestration:
- Checkout orchestration remains out of scope.

Boundary with order state model:
- This slice constrains classification boundaries only; it does not design full state transitions.

Boundary with payment state model:
- This slice constrains consistency/classification boundaries only; it does not redesign provider/state behavior.

Boundary with future remediation tooling:
- Remediation tooling implementation remains deferred.

Boundary with future refund/reversal slices:
- Refund/reversal policy and workflows remain deferred.

Boundary with future admin operational tooling:
- Admin operational tooling/workflows remain deferred.

Boundary with future fulfillment/shipping slices:
- Fulfillment/shipping behavior remains deferred.

## 11) Explicit Deferrals

Deferred to later slices:
- Concrete outcome persistence/storage design
- Exact replay/dedup implementation
- Provider-specific recovery behavior
- Remediation tooling implementation
- Refund/reversal workflows
- Exact state-machine transitions
- Admin operational workflows

## 12) Acceptance Checklist (PASS/FAIL)

- [ ] PASS/FAIL: Document is docs-only and implementation-neutral.
- [ ] PASS/FAIL: Authoritative prior outcome boundary is explicit and reference-preserving.
- [ ] PASS/FAIL: Safe replay boundary forbids second stock outcome and semantic contradiction.
- [ ] PASS/FAIL: Duplicate boundary forbids second decrement/finalization semantics.
- [ ] PASS/FAIL: New intended finalization boundary is explicitly distinguishable from replay/duplicate handling.
- [ ] PASS/FAIL: Non-blurring rule explicitly forbids category collapse.
- [ ] PASS/FAIL: Fail-closed cases are explicit and warning-only fallback is excluded.
- [ ] PASS/FAIL: Prior-slice continuity (6.0A–6.1E) is explicit and non-overriding.
- [ ] PASS/FAIL: SKU remains resolver-only (not an independent second stock bucket).
- [ ] PASS/FAIL: Runtime/schema/API/UI/provider/remediation/refund/state-machine details remain deferred.
