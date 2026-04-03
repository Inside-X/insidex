# EPIC-6.B2.3 — Operator / Runbook Handling Boundary Freeze: Payment Valid but Stock Not Finalizable

- Type: Operator/runbook boundary policy freeze (docs-only)
- Status: Frozen for B2.3
- Date (UTC): 2026-04-03
- Canonical scope alignment reference: `main@d3ac8f1ce9fb3df825537b39633b9a8b8d812f9d` (warning-only mismatch handling per checkpoint note)

---

## 1) Scope and Non-Goals

This slice is a **docs-only operator/runbook boundary freeze** for the paid-valid, stock-non-finalizable case.

In scope:
- Operator visibility boundary.
- Operator decision boundary.
- Escalation boundary.
- Operational closure boundary.

Non-goals (explicit):
- No runtime implementation.
- No tooling implementation.
- No refund/reversal implementation.
- No schema/API/UI design.
- No provider-specific recovery redesign.

---

## 2) Policy Purpose

This document freezes, for this critical case only:
- operator visibility boundary,
- operator decision boundary,
- escalation boundary,
- closure boundary.

It does not define tooling UX, workflow automation, or runtime behavior.

---

## 3) Inputs Carried from B2.0 / B2.1 / B2.2

Carried assumptions (already frozen upstream):
1. Payment truth may exist without order confirmation.
2. Remediation boundary is explicit non-success territory.
3. Cancellation is not equivalent to refund completion.
4. Refund/reversal boundary is separate and non-automatic.
5. State policy classes/combinations are already frozen.

No new business-state or monetary-state model is introduced here.

---

## 4) Minimum Operator-Visible Distinctions

Operators/admins must be able to distinguish, at minimum:

1. Ordinary non-success vs remediation-boundary case.
2. Payment truth present vs absent.
3. Stock condition type: blocked vs unresolved vs contradictory.
4. Recoverability posture: potentially recoverable vs closure-oriented.
5. Monetary boundary posture: merely relevant vs explicitly approved.

Policy-only boundary:
- these are required distinctions,
- no tooling screen design is defined in this slice.

---

## 5) Operator Decision Boundary

### 5.1 Allowed operator actions (policy-level)
- Classify case into the correct non-success/remediation territory.
- Escalate based on boundary triggers.
- Request authoritative review when truth is unresolved.
- Maintain non-final status while contradictions remain.

### 5.2 Forbidden operator actions (policy-level)
- Treat payment truth as automatic order confirmation.
- Assume refund/reversal completion without boundary decision + evidence.
- Collapse contradictory states into success semantics.
- Reclassify remediation-boundary case as ordinary non-success for convenience.

---

## 6) Escalation Boundary

Operator handling must escalate when any of the following is true:

1. Authoritative truth is unresolved.
2. Stock/order/payment truth is contradictory.
3. Monetary boundary appears relevant but authority/evidence threshold is not met.
4. Repeated-handling classification is ambiguous or divergent.
5. Case remains non-converged beyond normal handling boundary.

Escalation rule:
- boundary uncertainty is escalation-positive, not silent-continue.

---

## 7) Closure Boundary

Case may be considered operationally closed only when all policy conditions below are true:

1. State classification is stable.
2. Customer-visible contradiction is resolved.
3. Order state is aligned with frozen B2.1 state policy.
4. Monetary boundary status is either:
   - resolved by approved decision path, or
   - explicitly deferred under policy without contradiction.
5. No unresolved forked truth remains across stock/order/payment handling history.

If any condition is unmet, case remains non-closed.

---

## 8) Forbidden Operator Assumptions / Actions

Operators must never:

1. Mark order confirmed solely because payment exists.
2. Treat remediation-boundary case as ordinary non-success.
3. Imply refund completion without explicit decision/evidence.
4. Close case while contradictory truth remains.
5. Blur cancellation semantics with monetary resolution semantics.
6. Use payment truth alone to justify operational closure.

---

## 9) Relationship to Prior EPIC-6 Slices

B2.3 depends on:
- B2.0, B2.1, B2.2,
- prior EPIC-6 boundaries (including 1E, 2B, 2C and the R4/R5 contract chain).

B2.3 does not weaken:
- fail-closed posture,
- no-oversell guarantees,
- R4 success-boundary enforcement,
- R5 remediation-boundary signaling,
- idempotency/replay safety,
- identity/same-intended-finalization constraints.

B2.3 does not reopen already-closed slice responsibilities.

---

## 10) What Remains Outside B2.3

Still out of scope after this freeze:
1. Exact tooling UX.
2. Exact automation rules.
3. Exact implementation sequencing.
4. Final customer wording.
5. Actual refund/reversal execution implementation.

---

## 11) Strict Recommendation

No implementation for this case should proceed unless runtime/business handling, monetary boundary handling, and operator/runbook boundary handling are aligned to B2.1/B2.2/B2.3 together.

---

## 12) Acceptance Checklist (Binary PASS/FAIL)

- [x] PASS: Docs-only operator/runbook boundary freeze; no runtime/tooling implementation content.
- [x] PASS: Minimum operator-visible distinctions are explicit and bounded.
- [x] PASS: Operator allowed vs forbidden decision boundary is explicit.
- [x] PASS: Escalation triggers are explicit and fail-closed.
- [x] PASS: Closure boundary conditions are explicit and non-contradictory.
- [x] PASS: Forbidden operator assumptions/actions are explicitly frozen.
- [x] PASS: Prior EPIC-6 constraints are preserved and non-weakened.
- [x] PASS: Out-of-scope items remain explicit and bounded.
- [x] PASS: One strict recommendation is present.

