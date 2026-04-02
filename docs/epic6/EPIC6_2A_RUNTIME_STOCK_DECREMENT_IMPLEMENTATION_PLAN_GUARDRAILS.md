# EPIC-6.2A — Runtime Stock Decrement Implementation Plan / Guardrails

- Type: Implementation-planning guardrails freeze (docs-only)
- Status: Frozen for EPIC-6.2A
- Date (UTC): 2026-04-02
- Canonical checkpoint reference: `main@4031db7c965b5a4054d33b326c2aeab5e2c3aef5`

## 1) Scope and Non-Goals

This slice is planning-only and defines runtime execution order and guardrails.

In scope:
- Runtime implementation sequence (small slices)
- Cross-slice guardrails
- Entry criteria for runtime coding
- Exit criteria/proof obligations per runtime slice
- Stop conditions / anti-drift gates

Non-goals (explicit):
- Runtime implementation in this slice
- Schema implementation in this slice
- Checkout/payment redesign
- Shipping/logistics implementation
- Admin stock UI
- Provider-specific payment recovery design
- Remediation tooling implementation

## 2) Purpose of the Implementation Plan

This plan exists to:
- Convert the completed EPIC-6 contract chain into a safe runtime execution sequence.
- Prevent large, ambiguous runtime implementation jumps.
- Preserve no-oversell, fail-closed, identity, and idempotency guarantees during rollout.

## 3) Required Predecessor Contract Baseline (Mandatory)

Runtime work under EPIC-6.2A must treat the following as binding constraints:
- EPIC-6.0A
- EPIC-6.0B
- EPIC-6.1A
- EPIC-6.1B
- EPIC-6.1C
- EPIC-6.1D
- EPIC-6.1E
- EPIC-6.1F
- EPIC-6.1G

## 4) Recommended Runtime Slice Order (Small, Sequential)

Implement in this order, without merging slices:

1. **Runtime Slice R1 — Identity-Safe Target Resolution Core**
   - Establish deterministic server-side stock-bearing target resolution for decrement attempts.

2. **Runtime Slice R2 — Decrement Attempt Coordination Core**
   - Enforce deterministic decrement attempt handling relative to order/payment finalization boundary.

3. **Runtime Slice R3 — Idempotent Outcome + Replay-Safe Classification**
   - Enforce authoritative-outcome, safe-replay, duplicate, and new-intended-finalization separation.

4. **Runtime Slice R4 — Finalization Boundary Enforcement**
   - Prevent success semantics unless decrement coordination outcome is safely established.

5. **Runtime Slice R5 — Reconciliation/Remediation Boundary Signaling**
   - Route non-converged/inconsistent cases into explicit remediation territory without false-success claims.

## 5) Global Guardrails for Every Runtime Slice

Non-negotiable guardrails:
- Fail closed on uncertainty.
- No silent oversell.
- No weak/fuzzy “same intended finalization” matching.
- No duplicate decrement effect.
- No contradictory stock/order/payment success semantics.
- SKU remains resolver-only, never a second stock bucket.
- No widening of scope inside a slice.
- No best-effort/warning-only success continuation.

## 6) Entry Criteria for Runtime Slice R1

Before runtime coding starts, all of the following must hold:
- 6.0A–6.1G are accepted as mandatory constraints by implementation owners.
- Runtime slice order (R1→R5) is locked and reviewed.
- Existing code paths that currently handle order/payment/decrement attempts are identified as implementation touchpoints.
- Proof/evidence format is agreed (tests + deterministic behavior evidence per slice).
- Team commits to stop conditions in Section 8.

## 7) Exit Criteria / Proof Obligations Per Runtime Slice

Each runtime slice must prove all of the following before next-slice start:
- Deterministic behavior for in-scope classification/decision paths.
- Fail-closed behavior for uncertainty/ambiguity paths.
- No duplicate-success semantics in repeated handling for the same intended finalization.
- No identity ambiguity leakage across stock-bearing target resolution.
- Targeted tests and evidence artifacts demonstrating the above.

Minimum additional emphasis by slice:
- **R1:** no target-identity ambiguity leakage.
- **R2:** no partial/uncertain decrement treated as success.
- **R3:** replay/duplicate/new-intended-finalization distinctions remain non-blurred.
- **R4:** order/payment success semantics never contradict stock outcome.
- **R5:** non-converged cases are explicit and non-successful.

## 8) Stop Conditions / Anti-Drift Rules

Runtime work must stop and re-freeze/re-plan when any condition occurs:
- Identity model ambiguity discovered that violates 6.0B continuity.
- Same-intended-finalization cannot be made non-fuzzy.
- Replay vs new-intended-finalization cannot be safely distinguished.
- Stock/order/payment truth can fork under repeated handling.
- Remediation boundary cannot be stated clearly without contradiction.
- Current slice grows beyond planned boundary.

## 9) Relationship to Adjacent Areas

Boundary with checkout orchestration:
- No checkout redesign is part of EPIC-6.2A execution slices.

Boundary with payment logic:
- No payment-provider redesign; only consistency with stock/finalization constraints is in scope.

Boundary with order state model:
- Runtime slices enforce boundary semantics; full order-state redesign is out of scope.

Boundary with remediation tooling:
- Tooling implementation remains out of scope here.

Boundary with shipping/fulfillment:
- Shipping/fulfillment behavior remains out of scope.

Boundary with admin operational tooling:
- Admin operational tooling/UI remains out of scope.

## 10) Explicit Deferrals

Deferred to later runtime/ops slices:
- Shipping/delivery logic
- Admin UI
- Provider-specific recovery/refund behavior
- Broad remediation tooling
- Full operational workflows

## 11) Acceptance Checklist (PASS/FAIL)

- [ ] PASS/FAIL: Plan is docs-only and implementation-neutral.
- [ ] PASS/FAIL: 6.0A–6.1G are explicitly required predecessor constraints.
- [ ] PASS/FAIL: Runtime rollout is split into small ordered slices (R1→R5).
- [ ] PASS/FAIL: Global guardrails preserve no-oversell/fail-closed/idempotency/identity posture.
- [ ] PASS/FAIL: Entry criteria for first runtime slice are explicit.
- [ ] PASS/FAIL: Exit criteria/proof obligations are explicit and gate next-slice start.
- [ ] PASS/FAIL: Stop conditions are explicit and anti-drift.
- [ ] PASS/FAIL: Adjacent-area boundaries and explicit deferrals are clear.
