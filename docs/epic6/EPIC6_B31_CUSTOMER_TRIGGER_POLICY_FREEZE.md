# EPIC-6.B3.1 — Customer Trigger Policy Freeze

- Type: Customer trigger-policy freeze (docs-only)
- Status: Frozen for B3.1
- Date (UTC): 2026-04-07
- Canonical scope alignment reference: `main@094f86f2aa7276baceef32398b13a62ee79a5c68` (warning-only mismatch handling per checkpoint note)

---

## 1) Scope and Non-Goals

This slice is a **docs-only trigger-policy freeze** for customer-facing semantic-class emission.

In scope:
- Business trigger conditions for when each semantic class may be emitted.
- Blocking conditions for when each semantic class must not be emitted.
- Downgrade rules for reduced external representation.

Non-goals (explicit):
- No template implementation.
- No email/outbox implementation.
- No runtime implementation.
- No UI copy implementation.
- No refund/reversal implementation.
- No remediation workflow/tooling implementation.
- No provider-specific messaging redesign.

---

## 2) Policy Purpose

This document freezes **trigger conditions only**.

It does not define:
- wording,
- transport,
- rendering,
- automation implementation,

and does define:
- business rules for when a semantic class may or may not be emitted.

---

## 3) Inputs Carried from B2 and B3.0

Binding carried assumptions:
1. Payment truth may exist without final confirmation.
2. Confirmed semantics must not outrun business truth.
3. Remediation-boundary is explicit non-success territory.
4. Cancellation is distinct from monetary completion.
5. Reduced external representation is required in some cases.
6. B2.1/B2.2/B2.3 and B3.0 are binding constraints.

No new state model or monetary model is introduced here.

---

## 4) Semantic Classes Covered by This Trigger Policy

Included classes:
1. **Acknowledged**
2. **Pending confirmation**
3. **Under review**
4. **Cancelled**
5. **Confirmed**
6. **Ready for pickup / local fulfillment ready**

Exclusions/deferred classes:
- No new semantic classes are introduced in this freeze.
- Copy variants, channel variants, and localization variants are deferred.

---

## 5) Positive Trigger Conditions

A class may be emitted only when all listed conditions are true.

### 5.1 Acknowledged
- Intake/payment recognition truth exists.
- No stronger confirmed/ready class is currently valid.
- Emission would not contradict known business truth.

### 5.2 Pending confirmation
- Case is non-final and confirmation is not yet allowed.
- Business truth is not contradictory with “not yet confirmed” semantics.
- Case is not already closed as confirmed/cancelled.

### 5.3 Under review
- Case is in remediation-boundary or equivalent non-converged review territory.
- Normal success semantics are blocked.
- Internal handling/escalation is active or required.

### 5.4 Cancelled
- Business cancellation decision exists and is stable.
- Order state supports cancellation-class emission.
- Cancellation emission does not misrepresent monetary completion.

### 5.5 Confirmed
- Finalization/business truth is converged.
- No unresolved stock/order/payment contradiction exists.
- No active remediation-boundary condition blocks success semantics.

### 5.6 Ready for pickup / local fulfillment ready
- Confirmed success conditions are already met.
- Fulfillment-readiness truth exists (policy conceptually satisfied).
- No unresolved condition would make readiness semantics premature.

---

## 6) Blocking Conditions

A class is blocked if any listed condition is true.

### 6.1 Acknowledged blocked when
- It would contradict a stable stronger class already valid and emitted.
- It would hide required downgrade to under-review semantics.

### 6.2 Pending confirmation blocked when
- Case is already confirmed or cancelled.
- Case requires under-review semantics due to non-converged contradiction.

### 6.3 Under review blocked when
- Case has converged cleanly and stronger stable class is valid (`Confirmed` or `Cancelled`).
- No review/remediation condition exists.

### 6.4 Cancelled blocked when
- Cancellation decision is not yet made/stable.
- Emission would incorrectly imply monetary completion.

### 6.5 Confirmed blocked when
- Stock/finalization truth is unresolved, contradictory, or blocked.
- Remediation-boundary condition is active.
- Authoritative truth remains uncertain.

### 6.6 Ready blocked when
- Confirmed class is not valid.
- Fulfillment-readiness truth is not established.
- Any unresolved contradiction could invalidate readiness.

---

## 7) Reduced External Representation Trigger Rules

System must downgrade to reduced external representation when stronger classes would overstate certainty.

Mandatory downgrade cases:
1. `PAID_UNCONFIRMED` -> emit only `Acknowledged` and/or `Pending confirmation`.
2. `REMEDIATION_REVIEW` -> emit `Under review` (not `Confirmed`/`Ready`).
3. `Cancelled` with unresolved monetary completion finality -> emit `Cancelled` only, with no implied monetary completion class.

Rule:
- choose the strongest non-contradictory external class allowed by current business truth,
- otherwise downgrade to weaker/reduced class.

---

## 8) Forbidden Trigger Shortcuts

The following trigger shortcuts are forbidden:

1. Payment truth automatically triggers `Confirmed`.
2. Payment truth automatically triggers `Ready`.
3. Remediation-boundary still auto-emits ordinary success classes.
4. Cancellation automatically implies monetary completion.
5. Internal ambiguity still allows strong customer-facing classes (`Confirmed`/`Ready`).
6. Any automatic class escalation that outruns authoritative business truth.

---

## 9) Relationship to B2 Freezes and B3.0

This trigger policy:
- is aligned with B2.1, B2.2, B2.3, and B3.0,
- does not weaken fail-closed posture,
- does not weaken R4/R5 boundaries,
- does not reopen already-closed responsibilities.

---

## 10) Inputs Deferred to Later Stories

Outside this trigger-policy freeze:
1. Exact wording/templates.
2. Email/outbox implementation.
3. UI rendering details.
4. Sequencing of delivery channels.
5. Exact implementation hooks.

---

## 11) Strict Recommendation

Do not implement templates, message transport, or customer-facing emission logic until trigger rules for all customer-visible semantic classes are explicitly aligned to this freeze.

---

## 12) Acceptance Checklist (Binary PASS/FAIL)

- [x] PASS: Docs-only trigger-policy freeze; no runtime/template/transport implementation content.
- [x] PASS: All required semantic classes are covered with explicit positive triggers.
- [x] PASS: Class-specific blocking conditions are explicit.
- [x] PASS: Reduced external representation rules cover required critical states.
- [x] PASS: Forbidden trigger shortcuts are explicit and anti-drift.
- [x] PASS: Alignment with B2.1/B2.2/B2.3 and B3.0 is explicit and non-weakening.
- [x] PASS: Deferred inputs remain bounded to later implementation slices.
- [x] PASS: One strict recommendation is present.

