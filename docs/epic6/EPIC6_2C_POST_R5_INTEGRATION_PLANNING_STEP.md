# EPIC-6.2C — Post-R5 Integration Planning Step (Single Bounded Slice)

- Type: Post-R5 integration planning checkpoint (docs-only)
- Status: Frozen for EPIC-6.2C
- Date (UTC): 2026-04-02
- Canonical reference checkpoint: `main@4629047f5292bbef04b69db4b250d05a61bc5274`

---

## 1) Scope of This Step

This checkpoint defines exactly one bounded integration-planning slice after R1→R5 closure.

In scope:
- Selection of one narrow integration seam for R1→R5 outputs.
- Entry criteria for implementation of that seam.
- Exit criteria and proof obligations for that seam.
- Stop conditions that force re-plan if drift appears.

Out of scope:
- Runtime behavior changes.
- Schema evolution.
- Checkout/payment redesign.
- Shipping/fulfillment behavior.
- Remediation workflow tooling.
- Provider-specific recovery/refund orchestration.

---

## 2) Required Baseline (Binding)

The following documents are mandatory constraints for any post-R5 integration implementation planned here:
- EPIC-6.0A
- EPIC-6.0B
- EPIC-6.1A
- EPIC-6.1B
- EPIC-6.1C
- EPIC-6.1D
- EPIC-6.1E
- EPIC-6.1F
- EPIC-6.1G
- EPIC-6.2A
- EPIC-6.2B

No rule in this document may weaken prior fail-closed, no-oversell, identity, or idempotency boundaries.

---

## 3) Relationship to Prior Slices

EPIC-6.2C is a post-closure planning checkpoint and therefore:
- depends on EPIC-6.0A–6.1G and EPIC-6.2A/EPIC-6.2B as binding predecessors,
- does not weaken any predecessor fail-closed, no-oversell, identity, idempotency, or boundary guarantees,
- does not reopen closed runtime slice boundaries established through R1→R5 closure.

Preserved runtime-slice boundary posture:
- R1 isolation is preserved.
- R2 isolation is preserved.
- R3 isolation is preserved.
- R4 success-boundary-only posture is preserved.
- R5 signaling-only posture is preserved.

---

## 4) Chosen Single Integration Slice (Only)

### Slice Name
**I1 — Success Emission Boundary Wiring (R1→R5-aligned outputs consumed at one existing success emission point).**

### Why this slice first
- It is the smallest useful integration seam with high safety leverage.
- It uses already-closed R1→R5 semantics without broad orchestration redesign.
- It directly prevents contradictory stock/order/payment success semantics from leaking through a legacy success emitter.

### Hard boundary for I1
- Integrate at **one** existing success emission enforcement point only.
- Consume outputs/signals produced by R1→R5-aligned runtime logic.
- Do not redesign checkout architecture, payment provider flows, or remediation execution.

---

## 5) Entry Criteria for I1

All of the following must be true before implementation begins:
1. One concrete success-emission touchpoint is identified and frozen for this slice.
2. Mapping from R1→R5 outputs into that touchpoint is specified deterministically.
3. Fail-closed default behavior is defined for missing/ambiguous/contradictory upstream signals.
4. Negative-path test plan exists (ambiguity, contradiction, non-convergence, duplicate/replay/new-intended-finalization distinctions).
5. Scope lock is acknowledged: no expansion into remediation tooling or provider-specific recovery.

---

## 6) Exit Criteria / Proof Obligations for I1

I1 is complete only when all of the following are evidenced:
1. Success emission is blocked when R4 boundary conditions are not satisfied.
2. R5 remediation-boundary signals do not produce success semantics.
3. Duplicate/replay/new-intended-finalization outcomes remain non-blurred at the integration seam.
4. Ambiguous/unclassifiable paths fail closed (no warning-only success continuation).
5. Tests prove deterministic behavior for both positive and negative paths at the selected touchpoint.
6. No additional success emitters were changed beyond the one frozen touchpoint.

---

## 7) Stop Conditions (Mandatory Re-Plan Triggers)

Stop implementation and return to planning if any condition occurs:
- A second integration seam is required to make I1 work.
- Same-intended-finalization matching cannot remain strict/non-fuzzy at the seam.
- The seam requires schema redesign not previously approved.
- Contradictory stock/order/payment truth appears under repeated handling.
- I1 requires remediation workflow execution instead of signaling-only behavior.

---

## 8) Non-Goals Reaffirmed (No Silent Expansion)

This step does not authorize:
- broad cross-service orchestration changes,
- shipping/fulfillment coupling,
- provider-specific payment recovery logic,
- refund/reversal policy design,
- admin operations UI/tooling,
- additional post-I1 integration slices in the same change set.

---

## 9) Deliverables Expected from the Next Runtime Slice

When I1 implementation is executed, expected artifacts are:
- A minimal code patch scoped to one success emitter.
- Targeted tests for seam behavior (positive + fail-closed negatives).
- Evidence that global guardrails remain intact (no-oversell/fail-closed/idempotency/identity continuity).
- Short closure note confirming whether I1 passed or triggered stop conditions.

---

## 10) Active Vigilance Carry-Forward

Only vigilance points still concretely actionable for I1 are carried forward:
1. Preserve strict/non-fuzzy same-intended-finalization matching at the integration seam.
2. Preserve non-blurred duplicate vs safe replay vs new-intended-finalization handling at the success emission boundary.
3. Preserve R4-aligned fail-closed blocking whenever stock/finalization truth is unresolved or contradictory.
4. Preserve R5 signaling-only behavior (no implicit remediation workflow execution inside I1).
5. Preserve single-seam discipline (one success emitter only) to prevent silent scope expansion.

---

## 11) Recommended Next Step

Implement **I1 — Success Emission Boundary Wiring** as the next bounded runtime slice.

---

## 12) Acceptance Checklist (PASS/FAIL)

- [x] PASS: Document is planning-only and docs-only.
- [x] PASS: Exactly one bounded post-R5 integration slice is chosen.
- [x] PASS: Relationship to prior slices is explicit and non-weakening.
- [x] PASS: Entry criteria are explicit and test-oriented.
- [x] PASS: Exit criteria preserve fail-closed and non-contradictory success semantics.
- [x] PASS: Stop conditions are explicit and anti-drift.
- [x] PASS: Active vigilance points are limited to still-actionable I1 concerns.
- [x] PASS: Recommended next step is explicit and singular (I1 only).
- [x] PASS: Non-goals prevent silent expansion into adjacent domains.
