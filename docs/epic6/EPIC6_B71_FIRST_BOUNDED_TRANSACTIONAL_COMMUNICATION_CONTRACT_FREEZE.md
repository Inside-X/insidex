# EPIC-6.B7.1 — First Bounded Transactional Communication Contract Freeze

- Type: Contract freeze (docs-only)
- Status: Frozen for B7.1
- Date (UTC): 2026-04-21
- Canonical scope alignment reference: `main@fc907f0169938c01680d10f261ded7263d449488` (branch/SHA mismatch is warning-only unless lineage is inconsistent)

---

## 1) Scope and Non-Goals

This slice is a **docs-only contract freeze**.

In scope:
- Freeze the first bounded transactional communication layer only.
- Freeze first-layer trigger legitimacy, customer semantics, anti-duplication posture, information hierarchy, wording quality, degraded handling, and account-surface alignment.

Non-goals (explicit):
- Not a full notification platform.
- Not multi-channel orchestration.
- Not final provider/runtime/template implementation.
- Not final DB schema.
- Not a preference center.
- Not support/refund portal behavior.
- Does not redefine frozen payment/order/fulfillment semantics from B2/B3/B4/B6.

---

## 2) Contract Purpose

This freeze defines what the first transactional communication layer must help customers understand, and what it must never imply.

Contract purpose:
1. Keep customer communication truthful and bounded by authoritative business truth.
2. Prevent communications that outrun, conflict with, or blur system truth.
3. Ensure communication is coherent, readable, calm, reassuring where appropriate, and practically useful.
4. Treat communication quality/readability as part of correctness, not optional polish.

---

## 3) First Bounded Communication Surface in Scope

### 3.1 Frozen in-scope surface
The first bounded communication surface is frozen to a **single semantic class family**:
- **Order received / pending confirmation** (first customer acknowledgment layer only).

Scope characteristics:
- Transactional customer-facing communication only.
- Semantically aligned with existing account list/detail customer wording.
- Limited to non-final acknowledgment posture.

### 3.2 Frozen out-of-scope for this phase
- Under-review outbound communications.
- Confirmed/ready/completed/cancelled outbound communications.
- Dispatch/in-motion outbound communications.
- Multi-event orchestration and broad notification timeline behavior.

Rationale:
- This class is highest-value and lowest semantic-risk first step.
- It provides immediate customer reassurance without claiming final success/progression.
- It avoids premature broad trigger matrix expansion.

---

## 4) Trigger Legitimacy Contract

Communication in this freeze may be considered only when all legitimacy conditions are satisfied:

1. Authoritative order truth exists for customer-owned order reference.
2. Current customer-safe status class is non-final **pending confirmation** equivalent.
3. Emission does not contradict newer truth already available to customer surfaces.
4. Emission does not require speculative inference from partial/ambiguous truth.
5. Emission does not imply readiness/completion/dispatch/final confirmation.

Communication is blocked when any of the following is true:
1. Truth is partial, ambiguous, contradictory, or stale.
2. A stronger or materially different customer-safe truth has superseded candidate communication.
3. Candidate wording would over-claim progression/finality.
4. Legitimacy cannot be proven with certainty at send decision time.

Contract posture:
- Anti-race and anti-duplication are mandatory at contract level.
- Engine internals are intentionally not defined in this slice.

---

## 5) First Communication Class Contract (Frozen Choice)

Frozen first class:
- **Order received / pending confirmation** only.

Frozen customer meaning:
1. The order has been received for handling.
2. Confirmation is pending.
3. No customer action is required immediately unless explicitly stated.
4. Final success/readiness/completion is not implied.

Why this class is first (contract justification):
1. Delivers immediate reassurance after order placement.
2. Minimizes risk of semantic overreach versus stronger classes.
3. Aligns with existing pending-confirmation semantics already present in customer surfaces.
4. Supports fail-closed behavior when downstream truths are still evolving.

---

## 6) Customer-Facing Semantic Contract

Future implementation under this freeze must preserve strict separation across:
1. Payment truth.
2. Order truth.
3. Fulfillment mode truth.
4. Readiness truth.
5. Completion truth.
6. Dispatch/in-motion truth.
7. Internal/operator truth.

### 6.1 What may be communicated together in this freeze
- Order reference + pending-confirmation class meaning.
- Calm next-step/reassurance text.
- Link to account/order detail.

### 6.2 What remains contextual only
- Payment wording only when truth-safe and non-collapsing.
- Fulfillment mode wording only when relevant and non-misleading.

### 6.3 What must never be collapsed
- Payment recognized != confirmed.
- Pending confirmation != ready/completed/dispatch in motion.
- Local fulfillment mode truth != carrier-style shipping truth.

### 6.4 What must never be shown raw
- Internal remediation/audit/operator diagnostics.
- Internal contradiction/replay/idempotency traces.
- Internal escalation reasoning.

### 6.5 Over-claiming prohibition
- No message may claim confirmed, ready, completed, delivered, dispatched, or refunded semantics under this class contract.

---

## 7) Anti-Duplication / Anti-Contradiction Contract

Frozen first-layer posture:

1. No silent duplicate sends for the same semantic communication unit.
2. Retries must not create customer-visible duplicate semantics.
3. Stale candidate sends must be suppressed.
4. Conflicting class sends are forbidden.
5. Weaker/stale pending message after stronger/final customer truth is forbidden.
6. If legitimacy is uncertain, do not send.

Fail-closed rule:
- uncertainty, contradiction risk, or stale truth risk => suppress emission.

---

## 8) Information Hierarchy Contract for the First Communication

### 8.1 Primary (must appear)
1. Order reference.
2. Customer-safe status wording: order received / pending confirmation.
3. “What this means now” line in non-final terms.

### 8.2 Secondary (use when applicable)
1. Concise item summary.
2. Fulfillment mode label (if relevant and truthful).
3. Next-step/reassurance text.
4. Link back to account/order detail.

### 8.3 Contextual (strict relevance only)
1. Payment wording only when appropriate and non-collapsing.
2. Degraded explanatory note when details are intentionally limited.

### 8.4 Internal (never shown raw)
1. Internal reason codes/operator diagnostics.
2. Internal transport/debug metadata.
3. Internal policy/race/idempotency traces.

---

## 9) Wording / Readability / Presentation Contract

Frozen quality constraints for future implementation:
1. Calm, clear, and direct wording.
2. No technical jargon.
3. No operator/internal language.
4. No misleading urgency or pressure framing.
5. Easy scanning with clear hierarchy.
6. Mobile-friendly readability.
7. Low visual noise and coherent density.
8. Modern, clean, trustworthy presentation posture.

Template/HTML artifacts are explicitly out of scope for this freeze.

---

## 10) Degraded / Failure Handling Contract

Required behavior boundaries:

1. **Provider send failure**
   - Business truth and transport truth must remain distinct.
   - Do not represent failed/unconfirmed transport as successful customer notification.

2. **Truth becomes stale before send**
   - Candidate must be suppressed if stale against newer customer-safe truth.

3. **Limited system certainty**
   - Do not escalate to stronger semantics.
   - Prefer suppression over speculative messaging.

4. **Potential contradiction with newer truth**
   - Suppress message; do not emit contradictory communication.

5. **Account detail available while communication is degraded**
   - Account/order detail remains customer self-service anchor.
   - Communication behavior must not conflict with account truth.

Global degraded rule:
- remain truthful, non-overclaiming, and fail-closed.

---

## 11) Relationship with Account/List/Detail Surfaces

Frozen alignment rules:
1. Message wording must align with existing account list/detail semantics.
2. Communication may summarize, but must not exceed or contradict account truth.
3. Account/order detail remains canonical customer self-service anchor.
4. Communication should guide customer back to account/order detail where useful.
5. Communication must not introduce richer semantic claims than currently supported customer surfaces.

---

## 12) Bounded Admin/Operator Implications

Minimum bounded implications frozen for this stage:
1. Visibility into bounded send outcomes (attempted/sent/failed/suppressed classes).
2. Confidence that emitted communication matched allowed customer truth class.
3. No silent duplicate sends.
4. No silent contradictory sends.

Out of scope:
- broad messaging operations platform,
- campaign tooling,
- cross-channel orchestration control plane.

---

## 13) Deferred Decisions (Intentionally Out of Scope)

1. Exact provider selection.
2. Exact runtime outbox/job design.
3. Exact dedupe/idempotency storage design.
4. Exact template markup and rendering implementation.
5. Exact DB schema.
6. Multi-channel expansion.
7. Customer preference management.
8. Advanced messaging ops tooling.

---

## 14) Strict Recommendation

After this B7.1 freeze, open exactly **one bounded runtime/provider-neutral slice** implementing only the first frozen communication class (`order received / pending confirmation`) aligned to this contract, without opening broad notification platform scope.

---

## 15) Acceptance Checklist (Binary PASS/FAIL)

- [x] PASS: Docs-only contract freeze scope is explicit.
- [x] PASS: First bounded communication surface is explicitly frozen to one class family.
- [x] PASS: Trigger legitimacy boundary is explicit and fail-closed.
- [x] PASS: Semantic separation contract is explicit and non-collapsing.
- [x] PASS: Anti-duplication/anti-contradiction posture is explicit.
- [x] PASS: Information hierarchy contract is explicit and bounded.
- [x] PASS: Wording/readability/presentation quality constraints are frozen without templates.
- [x] PASS: Degraded/failure handling contract is explicit and non-overclaiming.
- [x] PASS: Relationship with account/list/detail surfaces is explicit.
- [x] PASS: Admin/operator implications are bounded and non-platform.
- [x] PASS: Deferred decisions are explicit and implementation-neutral.
- [x] PASS: One strict next-step recommendation is present.
