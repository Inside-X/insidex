# EPIC-6.B2.2 — Refund / Reversal Boundary Policy Freeze: Payment Valid but Stock Not Finalizable

- Type: Refund/reversal boundary policy freeze (docs-only)
- Status: Frozen for B2.2
- Date (UTC): 2026-04-03
- Canonical scope alignment reference: `main@2fe3cc2718a43b14e1caec45f0815b17d6f88b07` (warning-only mismatch handling per checkpoint note)

---

## 1) Scope and Non-Goals

This slice is a **docs-only refund/reversal boundary freeze** for paid-valid but stock-non-finalizable cases.

In scope:
- Policy meaning of when refund/reversal becomes relevant.
- Policy meaning of when refund/reversal is premature or forbidden.
- Policy boundaries for decision authority and minimum evidence.

Non-goals (explicit):
- No runtime implementation.
- No provider API integration.
- No refund/reversal execution logic.
- No remediation tooling/workflow implementation.
- No schema/API/UI design.
- No provider-specific flow redesign beyond boundary semantics.

---

## 2) Policy Purpose

This document freezes the **decision boundary only**.

It does not define:
- execution,
- automation,
- workflow tooling,

and does define:
- business/operational meaning of when refund or reversal becomes relevant.

---

## 3) Input Assumptions from B2.0 and B2.1

Carried assumptions (already frozen upstream):
1. Payment truth may exist without final confirmation.
2. Order may remain `PAID_UNCONFIRMED`.
3. Remediation boundary is explicit non-success territory.
4. Cancellation is not equivalent to refund completion.
5. Payment truth does not imply immediate automatic refund/reversal.

No additional behavioral assumptions are introduced here.

---

## 4) Refund vs Reversal (Policy-Level Distinction)

### 4.1 Refund boundary (policy meaning)
- Boundary where returning already-captured/settled customer funds becomes business-relevant.
- Typical relevance: payment truth indicates material capture/paid outcome and case is being closed without successful finalization.

### 4.2 Reversal boundary (policy meaning)
- Boundary where void/cancel/reverse of not-fully-settled or still-reversible monetary state becomes business-relevant.
- Typical relevance: monetary state is still reversible by policy/provider constraints.

### 4.3 Non-interchangeability rule
- Refund and reversal are not interchangeable terms.
- They may share business objective (monetary unwinding) but differ by monetary state preconditions and feasible action type.
- Policy must classify which boundary is relevant before any execution design.

No provider-specific execution flow is defined in this slice.

---

## 5) When Refund/Reversal Becomes Relevant

Refund/reversal enters scope only when **all** boundary conditions below are satisfied:

1. Payment truth exists at materially actionable level.
2. Safe stock/order finalization convergence is no longer reasonably attainable under approved policy constraints.
3. Business decision to terminate/close the case has been made (not merely suspected).
4. Authoritative classification is stable enough to avoid contradictory monetary action.
5. Evidence sufficiency threshold is met for non-contradictory action.

If any condition is missing, monetary action remains out of boundary.

---

## 6) When Refund/Reversal Is Premature or Forbidden

Refund/reversal must **not** be assumed or triggered when any of the following holds:

1. Authoritative truth is unresolved.
2. Safe convergence may still be recoverable.
3. Repeated-handling classification remains ambiguous.
4. Cancellation semantics are not yet decided.
5. Evidence is insufficient for monetary action.
6. Reversibility assumptions are not yet confirmed.
7. Case ownership/decision authority is undefined.

Fail-closed rule:
- uncertain classification => no automatic monetary action.

---

## 7) Decision Authority Boundary

Monetary action is allowed only after explicit policy-governed decision authority is established.

Required policy posture:
- No default automatic refund/reversal solely from payment truth.
- No implicit authority inference from provider status alone.
- Decision must be explicit, attributable, and auditable (human-approved or policy-approved system decision defined in later slices).

Deferred to future implementation slices:
- exact approver roles,
- exact escalation routing,
- exact automation gates.

---

## 8) Minimum Evidence Boundary

Before future refund/reversal implementation may act, minimum evidence classes must be present:

1. Stable payment-truth classification.
2. Stable stock/finalization non-convergence classification.
3. Non-contradictory order-state classification.
4. Clear case ownership and traceability identifiers.
5. Sufficient dedup/idempotency evidence to avoid double monetary action.
6. Sufficient record of prior handling attempts and outcome classification continuity.

Insufficient evidence in any class keeps monetary action out of boundary.

---

## 9) Relationship to Cancellation and Remediation Boundary

Policy clarifications:
- Cancellation is not refund completion.
- Remediation-boundary presence does not automatically require refund/reversal execution.
- Refund/reversal may follow certain cancellation/remediation decisions, but is not identical to those decisions.

Ordering rule (policy-level):
- classify case state and closure intent first,
- then evaluate refund/reversal boundary applicability.

---

## 10) Forbidden Assumptions

The following assumptions are explicitly forbidden:

1. Every paid-but-non-finalizable case must be refunded immediately.
2. Reversal is always available.
3. Cancellation equals refund completion.
4. Provider status alone determines business action.
5. Unresolved cases can safely trigger monetary action.
6. Payment truth alone is sufficient authority/evidence for monetary execution.

---

## 11) Relationship to Prior EPIC-6 Slices

B2.2 depends on:
- B2.0 and B2.1,
- prior EPIC-6 boundaries (including 0A, 1B, 1E, 1F, 1G, 2B, 2C).

B2.2 does not weaken:
- fail-closed posture,
- no-oversell guarantees,
- R4 success-boundary enforcement,
- R5 remediation-boundary signaling,
- idempotency/replay safety,
- identity/same-intended-finalization constraints.

B2.2 does not reopen already-closed slice responsibilities.

---

## 12) Inputs Deferred to B2.3

Outside this boundary freeze:
1. Operator/runbook handling details.
2. Exact escalation workflow.
3. Exact future implementation sequencing.
4. Final customer-facing wording for monetary resolution.

---

## 13) Strict Recommendation

No implementation of refund/reversal handling for this case should proceed until monetary boundary triggers, decision authority, and evidence requirements are explicitly aligned to this freeze.

---

## 14) Acceptance Checklist (Binary PASS/FAIL)

- [x] PASS: Docs-only boundary freeze; no runtime implementation content.
- [x] PASS: Refund vs reversal policy meanings are explicitly distinct.
- [x] PASS: Relevance boundary and premature/forbidden boundary are explicit.
- [x] PASS: Decision authority and minimum evidence boundaries are explicit.
- [x] PASS: Cancellation/remediation/refund/reversal semantics are non-blurred.
- [x] PASS: Forbidden automatic assumptions are explicitly frozen.
- [x] PASS: Prior EPIC-6 constraints are preserved and non-weakened.
- [x] PASS: Deferred B2.3 inputs are explicit and bounded.
- [x] PASS: One strict recommendation is present.

