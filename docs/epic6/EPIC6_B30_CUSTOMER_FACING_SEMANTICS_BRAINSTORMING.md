# EPIC-6.B3.0 — Customer-Facing Semantics Brainstorming

- Type: Customer-semantics clarification checkpoint (docs-only)
- Status: Drafted for B3.0
- Date (UTC): 2026-04-07
- Canonical scope alignment reference: `main@9502209b7bc227b695c84c2d44cd4877c4bebeee` (warning-only mismatch handling per checkpoint note)

---

## 1) Scope and Non-Goals

This slice is a **docs-only customer-semantics brainstorming checkpoint**.

In scope:
- Policy-level clarification of customer-visible semantics for normal, degraded, and remediation-boundary commerce situations.
- Clarification of what customers may see, may infer, and must never be led to believe.

Non-goals (explicit):
- No template implementation.
- No runtime implementation.
- No UI copy implementation.
- No refund/reversal implementation.
- No remediation workflow/tooling implementation.
- No provider-specific messaging redesign.

---

## 2) Why This Clarification Is Required

Customer trust is highly sensitive to contradictory messaging.

If payment truth, order confirmation, fulfillment readiness, cancellation semantics, and remediation handling are blurred, customers can be incorrectly led to believe final success exists when business truth is still non-converged.

No implementation should proceed until customer-visible semantics are explicitly clarified and non-contradictory.

---

## 3) Core Customer-Visible Concepts to Distinguish

Business/communication concepts (not implementation states):

1. **Payment received / recognized**
   - Payment event has been recognized.
   - Does not imply final order confirmation.

2. **Order accepted**
   - Intake accepted for handling.
   - Does not imply stock finalization or fulfillment readiness.

3. **Order confirmed**
   - Final success commitment.
   - Requires converged business truth.

4. **Order not yet confirmed**
   - Explicit non-final status.
   - May coexist with payment recognized.

5. **Order under review / issue in progress**
   - Internal handling is active due to non-converged or exceptional condition.
   - Explicitly non-success territory.

6. **Order cancelled**
   - Business cancellation outcome.
   - Not equivalent to monetary completion.

7. **Ready for pickup / local fulfillment ready** (concept only)
   - Fulfillment-readiness signal.
   - Must be independent from payment acknowledgment.

Concepts that must not be collapsed:
- payment recognized != order confirmed,
- order accepted != order confirmed,
- under review != confirmed,
- cancelled != refund/reversal completion,
- payment recognized != readiness-for-pickup.

---

## 4) Core Customer Scenarios

### Scenario A — Normal success path
- Customer may be told (policy level): order confirmed and ready semantics only when business readiness is true.
- Customer must not be told: any degraded/remediation signal if not applicable.
- Internal only: technical finalization diagnostics.

### Scenario B — Payment truth exists but order not yet confirmed
- Customer may be told: payment recognized + order pending confirmation.
- Customer must not be told: confirmed/ready semantics.
- Internal only: stock/finalization uncertainty details.

### Scenario C — Payment truth exists and case is in remediation-boundary territory
- Customer may be told: issue under review / non-final handling in progress.
- Customer must not be told: ordinary success semantics.
- Internal only: remediation reason classification and authoritative conflict details.

### Scenario D — Order cancelled after non-converged handling
- Customer may be told: order cancelled as business outcome.
- Customer must not be told: monetary completion has occurred unless separately true and policy-authorized.
- Internal only: monetary boundary decision rationale and evidence trail.

### Scenario E — Case under active internal review
- Customer may be told: under review / awaiting final resolution.
- Customer must not be told: final success or readiness signals.
- Internal only: operator escalation path, unresolved-truth causes, non-convergence diagnostics.

---

## 5) Allowed Customer-Facing Semantics (Policy Classes)

Allowed semantic classes (policy-level only):
- **Acknowledged** (intake/payment recognized without final success implication)
- **Pending confirmation** (explicit non-final)
- **Under review** (non-converged/remediation handling)
- **Cancelled** (business cancellation class)
- **Confirmed** (final success class)

Constraint:
- semantic class must not outrun business truth.

No final UX copy is defined in this slice.

---

## 6) Forbidden Customer-Facing Contradictions

The following contradictions are forbidden:

1. Payment received -> therefore order confirmed.
2. Order confirmed while stock/finalization remains unresolved.
3. Remediation-boundary case presented as ordinary success.
4. Cancellation presented as monetary resolution completion.
5. “Ready” semantics shown before business readiness exists.
6. Customer-visible success emitted while internal truth remains contradictory.

---

## 7) Reduced External Representation Rule

When internal state is complex/non-converged, external representation must be reduced to non-contradictory classes.

Required cases:
- `PAID_UNCONFIRMED`: externally represented as payment acknowledged + pending confirmation (not final success).
- `REMEDIATION_REVIEW`: externally represented as under review/non-final.
- `CANCELLED` with unresolved monetary completion: externally represented as cancelled only, without implied monetary completion.

Rule:
- external representation may simplify internal detail,
- but must never contradict internal truth or imply unavailable certainty.

---

## 8) Relationship to B2 Freezes

Customer-facing semantics must remain aligned with:
- B2.1 state policy freeze,
- B2.2 refund/reversal boundary freeze,
- B2.3 operator/runbook boundary freeze.

B3.0 must not weaken those boundaries.

---

## 9) Inputs Deferred to Later Stories

Out of scope for this brainstorming checkpoint:
1. Exact trigger policy.
2. Exact templates/wording.
3. Exact email/outbox implementation.
4. Exact UI rendering details.

---

## 10) Strict Recommendation

Do not implement customer-trigger policy or customer-facing templates until customer-visible semantics are frozen and explicitly aligned with B2.1/B2.2/B2.3.

---

## 11) Acceptance Checklist (Binary PASS/FAIL)

- [x] PASS: Docs-only clarification; no runtime/template/UI implementation content.
- [x] PASS: Core customer-visible concepts are explicitly distinguished and non-collapsed.
- [x] PASS: Required scenarios define allowed vs forbidden customer semantics.
- [x] PASS: Forbidden contradiction set is explicit and anti-drift.
- [x] PASS: Reduced external representation rule is explicit for non-converged states.
- [x] PASS: Alignment to B2.1/B2.2/B2.3 is explicit and non-weakening.
- [x] PASS: Deferred inputs are bounded and implementation-neutral.
- [x] PASS: One strict recommendation is present.

