# EPIC-6.B2.0 — Business Brainstorming: Payment Valid but Stock Not Finalizable

- Type: Business clarification checkpoint (docs-only)
- Status: Drafted for B2.0
- Date (UTC): 2026-04-03
- Canonical scope alignment checkpoint: `main@171d224b01def6993d31faca11bc2856439d8f81`

---

## 1) Scope and Non-Goals

This slice is a **docs-only clarification / brainstorming checkpoint** to freeze business meaning before implementation.

In scope:
- Clarifying business semantics when payment truth exists but stock finalization cannot be safely completed.
- Clarifying allowed/forbidden state combinations for payment truth, stock truth, order finalization semantics, and customer/admin visibility.
- Clarifying boundaries that must be explicitly frozen before B2.1/B2.2/B2.3 runtime work.

Non-goals (explicit):
- No runtime implementation.
- No refund/reversal implementation.
- No remediation tooling/workflow implementation.
- No provider-specific recovery redesign.
- No broad checkout redesign.
- No UI copy implementation.
- No schema/API design.

---

## 2) Why This Clarification Is Required

This is a high-risk business case because monetary truth and inventory truth can diverge.

If payment is valid/captured/confirmed enough to matter, but stock cannot be finalized safely, ambiguous handling can produce contradictory outcomes across:
- customer communication,
- order state semantics,
- operations handling,
- financial remediation posture.

No implementation for this case should proceed until these business semantics are explicit and non-contradictory.

---

## 3) Glossary (Business Terms to Pin Down)

These terms are **not interchangeable** and must not be blurred.

- **Payment initiated**: customer/payment flow started a payment attempt; monetary settlement is not yet guaranteed.
- **Payment authorized**: provider approved an authorization hold/approval path; still not equivalent to settled capture.
- **Payment captured / paid**: provider indicates funds are captured/settled enough to be materially actionable.
- **Order accepted**: system accepted request intake for processing; this is not confirmation of finalizable fulfillment truth.
- **Order confirmed**: business-level success commitment that order can proceed as finalized.
- **Stock finalized**: stock truth for the intended finalization is safely resolved and decrement/finalization result is authoritative.
- **Stock not finalizable**: stock outcome is blocked, unresolved, contradictory, or otherwise unsafe for final success commitment.
- **Remediation boundary**: explicit territory for non-converged stock/order/payment truth; no success semantics allowed there.
- **Cancellation**: order-level business termination decision; independent from whether monetary reversal has already happened.
- **Refund boundary**: policy decision boundary for returning captured funds after payment truth exists.
- **Reversal boundary**: policy decision boundary for void/cancel/reverse of unsettled or provider-reversible payment states.

Terms that must not be blurred:
- Payment captured/paid **≠** order confirmed.
- Order accepted **≠** order confirmed.
- Stock not finalizable **≠** ordinary retryable non-success.
- Cancellation **≠** refund execution.
- Remediation boundary entry **≠** automatic refund/reversal.

---

## 4) Core Business Scenarios

### Scenario A — Normal success path (payment valid and stock finalizable)
- Success semantics allowed: **Yes**.
- Customer-visible confirmation allowed: **Yes**.
- Order may be treated as finalized: **Yes**.
- Case must remain non-final: **No**.

### Scenario B — Payment valid, stock finalization blocked deterministically
- Success semantics allowed: **No**.
- Customer-visible confirmation allowed: **No** for order-confirmed semantics.
- Order may be treated as finalized: **No**.
- Case must remain non-final: **Yes** (explicit non-final/remediation-capable territory).

### Scenario C — Payment valid, stock truth unresolved or contradictory
- Success semantics allowed: **No**.
- Customer-visible confirmation allowed: **No** for finalized-order semantics.
- Order may be treated as finalized: **No**.
- Case must remain non-final: **Yes** (must enter/remain in remediation boundary).

### Scenario D — Repeated handling/replay where prior payment truth exists
- Success semantics allowed: **Only if prior authoritative outcome is reconcilable and stock-finalization truth is converged**.
- Customer-visible confirmation allowed: **Only when non-contradictory with authoritative prior truth**.
- Order may be treated as finalized: **Only if no divergence/non-convergence remains**.
- Case must remain non-final: **Yes** whenever replay classification or truth convergence is unresolved.

### Scenario E — Case enters remediation boundary after payment truth exists
- Success semantics allowed: **No**.
- Customer-visible confirmation allowed: **No finalized success claim**.
- Order may be treated as finalized: **No**.
- Case must remain non-final: **Yes**, until explicit policy-governed resolution exits boundary safely.

---

## 5) Allowed vs Forbidden Business States (Critical Case)

Critical case: payment is valid/captured/confirmed enough to matter, but stock cannot be finalized safely.

Allowed:
- A paid-looking order can remain **not confirmed**.
- Customer may observe payment success signal while order remains **non-final** (if messaging is explicitly non-contradictory).
- Case may remain in **pending review / remediation-boundary equivalent** state.
- Order must remain operationally non-final when stock truth is blocked/unresolved/contradictory.

Forbidden:
- Marking order as confirmed/finalized when stock was not finalized safely.
- Emitting customer/business success semantics that imply fulfillment certainty when case is non-converged.
- Treating remediation-boundary territory as ordinary transient failure without explicit distinction.
- Auto-assuming refund/reversal completion or policy decision merely because payment exists and stock failed.

Must never happen (contradiction class):
- Simultaneous “order confirmed” and “stock not finalizable” semantics for the same intended finalization.
- Customer-facing final success statement while internal state is unresolved/contradictory/remediation-boundary.
- Replay/retry paths creating a second incompatible truth for the same intended finalization.

---

## 6) Customer Visibility Boundary

Customer may be told (policy-level):
- Payment event has been received/recognized.
- Order final confirmation is pending and not yet guaranteed.
- Additional handling may be required before order can be finalized.

Customer must not be told:
- Final order confirmation when stock finalization is blocked/unresolved.
- Implied fulfillment commitment when business truth is non-converged.
- Internal diagnostic reason codes that may confuse or leak internal-only semantics.

Internal/admin-only:
- Remediation-boundary reason classifications.
- Cross-boundary convergence diagnostics.
- Replay/authoritative-outcome conflict detail.

Anti-contradiction rule:
- Customer-visible messaging must never collapse “payment truth exists” into “order confirmed” unless stock finalization truth is safely converged.

(Implementation of final customer wording templates is deferred.)

---

## 7) Admin / Operations Visibility Boundary

Admins/operators must see, at minimum:
- Explicit distinction between ordinary non-success and remediation-boundary case.
- Whether payment truth exists (and at what material level: initiated/authorized/captured-paid).
- Whether stock finalization is blocked vs unresolved vs contradictory.
- Whether repeated handling/replay produced authoritative-outcome conflict risk.
- Correlation identifiers sufficient for manual investigation.

Required distinction:
- **Normal failure**: no material payment truth and no boundary contradiction.
- **Remediation-boundary after payment truth**: material payment truth exists but order/stock cannot be safely finalized.

Future work (deferred):
- Exact runbook steps.
- Exact tooling UX and operational queue mechanics.
- Exact SLA/escalation matrix and automation details.

---

## 8) Refund / Reversal Boundary Clarification

This slice does not implement refund/reversal workflows.

Boundary clarifications:
- Refund/reversal becomes relevant only after confirming case cannot safely converge to valid finalization within policy constraints.
- It is premature to trigger refund/reversal while authoritative truth classification is still unresolved or while convergence remains plausibly recoverable under approved policy.
- Future implementation must explicitly decide:
  - policy trigger conditions,
  - ownership/authority for decision,
  - sequencing relative to cancellation/final state semantics,
  - evidence requirements before monetary action.
- Must never be assumed automatically:
  - that every stock-non-finalizable paid case is immediately refunded,
  - that provider reversal is always available,
  - that cancellation and refund are equivalent actions.

---

## 9) Relationship to Prior EPIC-6 Slices

This checkpoint depends on and must remain consistent with:
- 6.0A, 6.0B,
- 6.1A, 6.1B, 6.1C, 6.1D, 6.1E, 6.1F, 6.1G,
- 6.2A, 6.2B, 6.2C,
- I1 success-emission seam context.

This checkpoint does **not** weaken:
- fail-closed posture,
- no-oversell guarantees,
- identity stability constraints,
- idempotency/replay safety boundaries,
- R4 finalization-boundary enforcement,
- R5 remediation-boundary signaling-only posture.

This checkpoint does **not** reopen previously closed runtime slice responsibilities.

---

## 10) Explicit Unresolved Questions for B2.1 / B2.2 / B2.3

Only unresolved items to carry forward:
1. Exact order-state policy for “payment-valid but stock-not-finalizable” cases.
2. Exact customer-communication policy (status classes and allowed semantics per class).
3. Exact refund/reversal boundary policy (decision triggers, sequencing, ownership, audit requirements).
4. Exact operator/runbook handling boundary (manual decision gates, escalation boundaries, closure criteria).

---

## 11) Strict Recommendation

Do **not** implement next runtime/business handling for this case until:
- order-state policy is explicitly frozen, and
- refund/reversal boundary policy is explicitly frozen.

---

## 12) Acceptance Checklist (Binary)

- [x] PASS: Document is docs-only clarification/brainstorming; no runtime implementation content.
- [x] PASS: Critical case semantics explicitly separate payment truth, stock truth, and order confirmation.
- [x] PASS: Allowed vs forbidden states are explicit for payment-valid/stock-not-finalizable conditions.
- [x] PASS: Customer/admin visibility boundaries are explicit and non-contradictory.
- [x] PASS: Refund/reversal boundary clarified without workflow implementation.
- [x] PASS: Relationship to prior EPIC-6 and I1 context is explicit and non-weakening.
- [x] PASS: Unresolved questions for B2.1/B2.2/B2.3 are explicitly listed.
- [x] PASS: Single strict recommendation provided.

