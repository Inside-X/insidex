# EPIC-6.1G — Same Intended Finalization Identification Boundary Freeze

- Type: Contract freeze (docs-only)
- Status: Frozen for EPIC-6.1G
- Date (UTC): 2026-04-02
- Canonical checkpoint reference: `main@71f197c620406a05669c45e59491fbcfe135b85e`

## 1) Scope and Non-Goals

This slice freezes only the boundary for identifying whether repeated handling attempts refer to the same intended finalization.

In scope:
- Boundary purpose
- Same-intended-finalization identification contract
- Identity-stability requirements
- Insufficient-signal restrictions
- Fail-closed ambiguity rules
- Explicit deferrals

Non-goals (explicit):
- Runtime implementation
- Exact idempotency-key storage design
- Exact dedup persistence model
- Payment provider redesign
- Refund/reversal implementation
- Remediation tooling implementation
- Admin operational workflow
- DB schema/migration design
- API payload design

## 2) Boundary Purpose

This slice exists to:
- Ensure “same intended finalization” is not inferred loosely.
- Prevent unsafe collapse of distinct attempts into one outcome.
- Prevent unsafe split of same-intent retries into separate outcomes.
- Preserve no-oversell, idempotency, and cross-boundary consistency.

## 3) Same Intended Finalization Identification Contract

Contract-level requirements:
- Same intended finalization requires identity continuity strong enough to justify replay/duplicate semantics.
- It must be evaluated against stock-bearing target intent, relevant order/checkout intent, and business finalization intent as one coordinated boundary.
- Weak identifier overlap alone is not sufficient.
- If same-intent identity cannot be established safely, flow must fail closed.

## 4) What Must Remain Stable

Across repeated handling attempts, the following categories must remain sufficiently stable:
- Stock-bearing target identity.
- Intended business finalization target.
- Relevant order/checkout intent reference.
- Attempt meaning relative to the same intended coordinated outcome.

This slice does not prescribe concrete field names or storage design.

## 5) What Is Not Sufficient by Itself

The following are not automatically sufficient on their own:
- Partial identifier overlap.
- Superficial payload similarity.
- Client-declared sameness.
- Reused external/provider reference without safe identity continuity.
- Reused SKU/product text alone without confirmed stock-bearing identity continuity.

Identity continuity rule from 6.0B:
- SKU is a resolver of variant identity, never a second stock bucket.

## 6) Non-Ambiguity / Non-Blurring Rule

Runtime implementation must not blur:
- Same intended finalization
- Safe replay
- Duplicate request
- New intended finalization

“Same intended finalization” must never be decided on weak or fuzzy matching.

## 7) Fail-Closed Cases

Progression/finalization must be blocked when any of the following occurs:
- Identity continuity unresolved.
- Attempt meaning relative to prior handling unresolved.
- Stock-bearing target continuity unresolved.
- Order/payment/business-finalization intent continuity unresolved.
- Attempt shares some identifiers but not enough to establish same intended finalization safely.

No warning-only fallback is allowed for these conditions.

## 8) Relationship to Prior Slices

- 6.0A froze stock ownership and no-oversell baseline.
- 6.0B froze stock-bearing identity and SKU/variant interpretation.
- 6.1A froze runtime decrement mechanics expectations.
- 6.1B froze decrement outcome vs finalization boundary semantics.
- 6.1C froze coordination strategy expectations.
- 6.1D froze idempotency/retry-safe coordination expectations.
- 6.1E froze reconciliation/remediation boundary semantics.
- 6.1F froze authoritative outcome / safe replay / duplicate / new intended finalization boundary.
- 6.1G freezes the identification boundary required to decide whether handling attempts refer to the same intended finalization.
- 6.1G does not redefine, weaken, or override prior slices.

## 9) Relationship to Adjacent Areas

Boundary with checkout orchestration:
- Checkout orchestration remains out of scope.

Boundary with order state model:
- This slice constrains identification boundary semantics only; it does not design full order-state transitions.

Boundary with payment state model:
- This slice constrains identification boundary semantics only; it does not redesign payment provider/state behavior.

Boundary with future idempotency persistence/storage design:
- Concrete persistence/storage design remains deferred.

Boundary with future remediation tooling:
- Remediation tooling implementation remains deferred.

Boundary with future refund/reversal slices:
- Refund/reversal policy and workflows remain deferred.

Boundary with future admin operational tooling:
- Admin operational tooling/workflows remain deferred.

## 10) Explicit Deferrals

Deferred to later slices:
- Concrete same-intent matching/storage implementation
- Exact idempotency key model
- Dedup persistence design
- Provider-specific recovery behavior
- Remediation tooling implementation
- Refund/reversal workflows
- Exact state-machine transitions
- Admin operational workflows

## 11) Acceptance Checklist (PASS/FAIL)

- [ ] PASS/FAIL: Document is docs-only and implementation-neutral.
- [ ] PASS/FAIL: Same-intended-finalization boundary requires strong continuity, not weak overlap.
- [ ] PASS/FAIL: Stability categories are explicit without over-specifying storage/field design.
- [ ] PASS/FAIL: Insufficient signals are explicitly rejected as standalone proof.
- [ ] PASS/FAIL: Non-ambiguity/non-blurring rule is explicit.
- [ ] PASS/FAIL: Fail-closed ambiguity cases are explicit and warning-only fallback is excluded.
- [ ] PASS/FAIL: Prior-slice continuity (6.0A–6.1F) is explicit and non-overriding.
- [ ] PASS/FAIL: SKU remains resolver-only (not an independent second stock bucket).
- [ ] PASS/FAIL: Runtime/schema/API/UI/provider/remediation/refund/state-machine details remain deferred.
