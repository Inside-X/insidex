# EPIC-6.B3.2 — Customer Templates and Degraded Wording Freeze

- Type: Customer wording-policy freeze (docs-only)
- Status: Frozen for B3.2
- Date (UTC): 2026-04-07
- Canonical scope alignment reference: `main@5ab45a522d38ce4dc3009045233639066f9b1e75` (warning-only mismatch handling per checkpoint note)

---

## 1) Scope and Non-Goals

This slice is a **docs-only wording-policy freeze** for customer-facing communications.

In scope:
- Allowed/forbidden wording envelope by semantic class.
- Global tone/certainty constraints.
- Degraded wording constraints for non-final and remediation-boundary cases.

Non-goals (explicit):
- No template implementation.
- No email/outbox implementation.
- No runtime implementation.
- No UI copy implementation in product code.
- No refund/reversal implementation.
- No remediation workflow/tooling implementation.
- No provider-specific messaging redesign.

---

## 2) Policy Purpose

This document freezes wording rules only.

It does not define:
- transport,
- exact channel sequencing,
- implementation hooks,

and does define:
- allowed/forbidden semantic wording envelope for future templates/messages.

---

## 3) Inputs Carried from B2 and B3.0/B3.1

Binding carried assumptions:
1. Payment recognition may exist without order confirmation.
2. Reduced external representation may be required.
3. Confirmed/ready wording must not outrun business truth.
4. Cancellation is distinct from monetary completion.
5. Under-review/remediation wording is explicit non-success territory.
6. B2.1/B2.2/B2.3 + B3.0 + B3.1 are binding constraints.

No new state model, trigger model, or monetary model is introduced.

---

## 4) Wording Classes Covered

This freeze covers wording policy for:
1. **Acknowledged**
2. **Pending confirmation**
3. **Under review**
4. **Cancelled**
5. **Confirmed**
6. **Ready for pickup / local fulfillment ready**

Exclusions:
- No additional classes are introduced.
- Class-specific production templates are deferred.

---

## 5) Allowed Wording Posture per Class

Policy-level constraints (not production template text).

### 5.1 Acknowledged
Allowed implication:
- request/payment recognition received,
- handling is in progress,
- no final success commitment.

### 5.2 Pending confirmation
Allowed implication:
- order outcome is not final yet,
- confirmation is still pending,
- no readiness or fulfillment commitment yet.

### 5.3 Under review
Allowed implication:
- active issue handling/review,
- non-final status,
- customer update will follow once resolution boundary is reached.

### 5.4 Cancelled
Allowed implication:
- business cancellation is final at order level,
- order will not proceed as confirmed/ready.
- monetary completion statement remains separate.

### 5.5 Confirmed
Allowed implication:
- order final success is achieved,
- confirmation is stable,
- no unresolved contradiction remains.

### 5.6 Ready
Allowed implication:
- local fulfillment/pickup readiness exists,
- customer can rely on readiness signal,
- class appears only after confirmed truth is valid.

---

## 6) Forbidden Wording Patterns per Class

### 6.1 Acknowledged must never
- imply confirmed/final success,
- imply ready/fulfillment-readiness.

### 6.2 Pending confirmation must never
- imply readiness,
- imply resolution/finality already reached.

### 6.3 Under review must never
- sound like ordinary success,
- present non-converged handling as resolved.

### 6.4 Cancelled must never
- imply refund/reversal completion unless separately true and policy-authorized,
- imply order may still proceed as confirmed/ready.

### 6.5 Confirmed must never
- appear while truth remains non-converged,
- appear alongside under-review semantics for same case.

### 6.6 Ready must never
- appear before real readiness exists,
- appear when confirmed semantics are blocked.

---

## 7) Tone and Certainty Rules (Global)

Global rules:
1. No overpromise.
2. No false certainty.
3. No contradictory reassurance.
4. No internal reason-code leakage.
5. No technical jargon to customer.
6. No blame language.

Uncertainty expression rule:
- uncertainty may be stated as pending/review status,
- must remain clear and accountable,
- must not imply hidden certainty or final success.

---

## 8) Degraded Wording Rules

Degraded policy coverage:

1. **Paid but not confirmed**
   - express payment recognition + pending confirmation,
   - never imply confirmation/readiness.

2. **Under review / issue in progress**
   - explicitly non-final,
   - clearly indicates active handling,
   - avoids success-like tone.

3. **Cancelled with unresolved monetary completion finality**
   - express cancellation only,
   - do not collapse into “cancelled and refunded.”

4. **Waiting for final confirmation**
   - communicate pending state,
   - do not imply success is guaranteed.

---

## 9) Relationship to Reduced External Representation

Wording must reflect reduced external representation rules:
- may be simpler than full internal truth,
- must never be stronger than internal truth,
- must never contradict B2 boundaries or B3.1 triggers.

Simplification is allowed; overstatement is forbidden.

---

## 10) Forbidden Shortcuts and Red-Flag Phrases

The following are forbidden as wording/implication patterns:

1. “confirmed” when only payment is recognized.
2. “ready” before readiness exists.
3. “resolved” while case is still under review.
4. “cancelled and refunded” when monetary completion is not policy-confirmed.
5. Any phrase that collapses payment recognition into final success.
6. Any degraded wording that sounds like ordinary success.

---

## 11) Relationship to B2 and B3.1

Wording policy must stay aligned with:
- B2.1 state policy,
- B2.2 refund/reversal boundary,
- B2.3 operator/runbook boundary,
- B3.0 semantics brainstorming,
- B3.1 trigger policy.

This freeze does not weaken those constraints.

---

## 12) Inputs Deferred to B3.3 / Implementation

Outside this wording freeze:
1. Exact template artifacts.
2. Transport/channel implementation.
3. Outbox logic.
4. Retry/idempotent sending behavior.
5. Exact UI rendering/hooks.

---

## 13) Strict Recommendation

Do not implement customer-facing templates or message transport until wording constraints are explicitly aligned with B2.1/B2.2/B2.3, B3.0, and B3.1.

---

## 14) Acceptance Checklist (Binary PASS/FAIL)

- [x] PASS: Docs-only wording freeze; no runtime/template/transport implementation content.
- [x] PASS: All required wording classes are covered.
- [x] PASS: Allowed and forbidden wording posture is explicit per class.
- [x] PASS: Tone/certainty rules explicitly prevent overstatement.
- [x] PASS: Degraded wording rules cover required critical cases.
- [x] PASS: Red-flag phrase shortcuts are explicitly forbidden.
- [x] PASS: Alignment to B2/B3.0/B3.1 is explicit and non-weakening.
- [x] PASS: Deferred implementation inputs remain bounded.
- [x] PASS: One strict recommendation is present.

