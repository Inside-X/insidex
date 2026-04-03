# EPIC-6.B2.1 — Business State Policy Freeze: Payment Valid but Stock Not Finalizable

- Type: State policy freeze (docs-only)
- Status: Frozen for B2.1
- Date (UTC): 2026-04-03
- Canonical scope alignment reference: `main@3bf4b7037d7092ca635d4b35ccaa9eac840f5f01` (warning-only mismatch handling per checkpoint note)

---

## 1) Scope and Non-Goals

This slice is a **docs-only state policy freeze** for the critical case where payment truth exists but stock cannot be safely finalized.

In scope:
- Frozen business state classes for this case.
- Frozen allowed/conditional/forbidden state combinations.
- Frozen contradiction set and visibility boundaries.
- Policy-level transition boundaries only.

Non-goals (explicit):
- No runtime implementation.
- No refund/reversal implementation.
- No remediation workflow tooling implementation.
- No schema/API/UI design.
- No provider-specific recovery redesign.

---

## 2) Policy Purpose

This document freezes business-state policy for the critical payment-valid/stock-not-finalizable case before implementation.

Purpose:
- remove ambiguity,
- prevent contradictory stock/order/payment semantics,
- preserve fail-closed handling,
- make impossible states explicit.

---

## 3) Input Assumptions Carried from B2.0

B2.1 adopts the following already-clarified assumptions from B2.0:
1. Payment truth may exist without order confirmation.
2. Stock truth may remain blocked, unresolved, or contradictory.
3. Remediation boundary is explicit non-success territory.
4. Payment truth is not equivalent to order confirmed/finalized success.

No additional assumptions are introduced in this slice.

---

## 4) Required State Classes (Minimum)

This freeze defines five non-overlapping business state classes.

1. **ACCEPTED**
   - Intake accepted for processing.
   - No confirmed final success implied.

2. **PAID_UNCONFIRMED**
   - Payment truth exists at materially actionable level (captured/paid or equivalent confirmed-enough truth).
   - Order is not yet confirmed as finalized success.

3. **REMEDIATION_REVIEW**
   - Non-final state for blocked/unresolved/contradictory stock/order/payment convergence.
   - Explicit remediation-boundary equivalent territory.

4. **CONFIRMED_FINAL**
   - Finalized business success state.
   - Allowed only when stock finalization truth is safely converged.

5. **CANCELLED**
   - Order-level termination state.
   - Not equivalent to refund/reversal completion.

State separation rule:
- `PAID_UNCONFIRMED` captures payment truth.
- `CONFIRMED_FINAL` captures fulfillment/finalization truth.
- These must never be auto-collapsed into one meaning.

---

## 5) Allowed State Combinations (Frozen)

Combination policy is expressed as **ALLOWED / CONDITIONAL / FORBIDDEN**.

### 5.1 Payment truth exists + order not confirmed
- Policy: **ALLOWED**.
- Required interpretation: `PAID_UNCONFIRMED` (or `REMEDIATION_REVIEW` if non-converged signals are present).

### 5.2 Payment truth exists + remediation-boundary state
- Policy: **ALLOWED**.
- Required interpretation: `REMEDIATION_REVIEW` with explicit non-success semantics.

### 5.3 Payment truth exists + cancelled
- Policy: **CONDITIONAL**.
- Allowed only as business cancellation semantics.
- Must not imply refund/reversal completion has occurred.

### 5.4 Payment truth exists + confirmed/finalized success
- Policy: **CONDITIONAL**.
- Allowed only when stock finalization truth is converged and non-contradictory.
- Forbidden when stock is blocked/unresolved/contradictory.

### 5.5 No payment truth + remediation-boundary equivalent
- Policy: **ALLOWED (narrow)**.
- Applies when convergence contradiction/non-final boundary exists independently of captured/paid truth.
- Must remain explicit non-success territory.

### 5.6 Frozen impossible combination
- `CONFIRMED_FINAL` + stock-not-finalizable context: **FORBIDDEN**.

---

## 6) Forbidden Contradictions (Must Never Exist)

1. `CONFIRMED_FINAL` while stock is not finalizable.
2. Customer-visible final success while internal state is unresolved/non-converged.
3. Remediation-boundary case represented as normal finalized success.
4. Cancellation semantics presented as if refund completion is guaranteed/completed.
5. Payment truth automatically implying confirmation/finalized success.
6. Simultaneous semantics where same intended finalization is both non-final remediation and finalized success.

---

## 7) Transitional Rules (Policy Only)

This section defines allowed transition directions at policy level (not workflow implementation).

### 7.1 Transitional-only states
- `ACCEPTED`, `PAID_UNCONFIRMED`, and `REMEDIATION_REVIEW` are transitional-capable states.
- `CONFIRMED_FINAL` and `CANCELLED` are terminal policy outcomes for this slice.

### 7.2 Allowed transition directions
- `ACCEPTED` -> `PAID_UNCONFIRMED`
- `ACCEPTED` -> `REMEDIATION_REVIEW`
- `ACCEPTED` -> `CANCELLED`
- `PAID_UNCONFIRMED` -> `CONFIRMED_FINAL` (only when stock convergence is safe)
- `PAID_UNCONFIRMED` -> `REMEDIATION_REVIEW`
- `PAID_UNCONFIRMED` -> `CANCELLED` (without implying refund completion)
- `REMEDIATION_REVIEW` -> `CONFIRMED_FINAL` (only after safe convergence)
- `REMEDIATION_REVIEW` -> `CANCELLED`

### 7.3 Forbidden transition directions
- Any transition into `CONFIRMED_FINAL` while stock remains blocked/unresolved/contradictory.
- Any implicit transition where payment truth alone causes `PAID_UNCONFIRMED` -> `CONFIRMED_FINAL`.

---

## 8) Internal vs External Visibility

### 8.1 Internal-only visibility
- `REMEDIATION_REVIEW` classification reasons and contradiction diagnostics.
- Convergence/conflict detail used for operator decisioning.

### 8.2 Customer-visible classes
- `CONFIRMED_FINAL`: customer-visible as final success class.
- `CANCELLED`: customer-visible as terminated class (without refund-status assumptions).

### 8.3 Customer-visible only in reduced/non-contradictory form
- `PAID_UNCONFIRMED` and `REMEDIATION_REVIEW` may be externally represented only as non-final/non-confirmed progress classes.
- External representation must not imply finalized success while internal convergence is unresolved.

No final UX copy is defined in this slice.

---

## 9) Relationship to Prior EPIC-6 Slices

B2.1 depends on:
- B2.0 clarification checkpoint,
- EPIC-6 boundaries including 0A, 1B, 1E, 1F, 1G, 2B, and 2C.

B2.1 does not weaken:
- fail-closed posture,
- no-oversell guarantees,
- R4 success-boundary enforcement,
- R5 remediation-boundary signaling posture,
- idempotency/replay safety,
- identity/same-intended-finalization constraints.

B2.1 does not reopen already-closed runtime slice responsibilities.

---

## 10) Inputs Deferred to B2.2 / B2.3

Outside this state freeze:
1. Exact refund/reversal boundary triggers and sequencing.
2. Operator/runbook handling detail and escalation workflow.
3. Final customer communication wording/templates.

---

## 11) Strict Recommendation

Do not implement this case until runtime/business handling is explicitly aligned with these frozen state combinations and forbidden contradictions.

---

## 12) Acceptance Checklist (Binary PASS/FAIL)

- [x] PASS: Docs-only state policy freeze; no runtime implementation content.
- [x] PASS: Minimum non-overlapping state classes are explicit.
- [x] PASS: Required critical combinations are classified ALLOWED/CONDITIONAL/FORBIDDEN.
- [x] PASS: Contradictions that must never exist are explicitly frozen.
- [x] PASS: Transitional rules are policy-only and non-workflow.
- [x] PASS: Internal vs external visibility boundaries are explicit without UX copy.
- [x] PASS: Prior EPIC-6 boundaries are preserved and non-weakened.
- [x] PASS: Deferred inputs for B2.2/B2.3 are explicit and bounded.
- [x] PASS: One strict recommendation is present.

