# EPIC-6.B7.3 — Under Review Transactional Communication Contract Freeze

- Type: Contract freeze (docs-only)
- Status: Frozen for B7.3
- Date (UTC): 2026-04-23
- Canonical scope alignment reference: `main@790ff60f103480307c4081a0114249c822129060` (branch/SHA mismatch is warning-only unless lineage is inconsistent)

---

## 1) Scope and Non-Goals

This slice is a **docs-only contract freeze**.

In scope:
- Freeze exactly one next bounded transactional communication class after B7.2A/B: **under review**.
- Freeze contract boundaries for legitimacy, semantics, wording posture, information hierarchy, degraded handling, and account-surface alignment for this class only.

Non-goals (explicit):
- Not a full notification platform.
- Not multi-channel orchestration.
- Not final provider/runtime/template implementation.
- Not final DB schema.
- Not support/refund portal behavior.
- Not a broad issue-resolution communication system.
- Does not redefine frozen payment/order/fulfillment semantics from B2/B3/B4/B6/B7.1/B7.2A/B.

---

## 2) Contract Purpose

This freeze defines what the **under-review** communication must help the customer understand and what it must not imply.

Contract purpose:
1. Ensure later implementation cannot send messages that outrun or contradict authoritative truth.
2. Reduce uncertainty in a calm way without creating panic or false confidence.
3. Keep communication practically useful and aligned with customer self-service surfaces.
4. Treat wording quality/readability as part of correctness, not optional polish.

---

## 3) Frozen Communication Class in Scope

Frozen class in this slice:
- **under review**

Frozen customer meaning:
1. The order is actively being reviewed because normal progression cannot currently be stated safely.
2. The order is not yet in a customer-final class.
3. The customer should rely on account order detail for the latest state while review is active.

This class does **not** mean:
1. Not equivalent to order received / pending confirmation.
2. Not equivalent to confirmed.
3. Not equivalent to ready.
4. Not equivalent to completed.
5. Not equivalent to cancelled.
6. Not equivalent to dispatch/in-motion.
7. Not equivalent to payment failure by default.

Distinctness rationale:
- `under_review` is a bounded non-final, non-routine handling class; it is stronger than generic pending confirmation but weaker than any confirmed/readiness/completion/cancellation/dispatch outcome class.

---

## 4) Trigger Legitimacy Contract

Under-review communication is legitimate only when all conditions are true:
1. Authoritative order truth exists for a customer-owned order reference.
2. Current customer-safe status truth is explicitly under-review equivalent (or equivalent degraded safe mapping that does not imply final progression).
3. The candidate message does not conflict with newer/stronger truth already established.
4. The send decision is based on non-ambiguous, non-partial, non-contradictory truth at decision time.

Under-review communication is forbidden when any condition is true:
1. Trigger is based only on operator suspicion, preliminary triage, or unverified diagnostics.
2. Truth is partial, stale, contradictory, or currently unavailable.
3. A stronger/newer customer-safe truth already applies (for example confirmed/ready/completed/cancelled/dispatch-relevant truth).
4. Candidate wording would over-claim finality or progression.

Contract posture:
- Anti-race and anti-duplication are mandatory.
- Fail-closed under uncertainty is mandatory.
- Engine internals are intentionally not defined in this freeze.

---

## 5) Relationship with Pending-Confirmation Communication

Frozen relationship between classes:
1. `under_review` **supersedes** `order received / pending confirmation` when authoritative truth moves into under-review territory.
2. The customer may have previously received pending-confirmation communication, but current communication must not continue emitting weaker pending-confirmation semantics once under-review legitimacy exists.
3. Under-review replaces prior weaker pending-confirmation outbound posture for current truth.

Coexistence/sequence contract:
1. Historical coexistence is acceptable (older pending-confirmation message exists in inbox/history).
2. Active contradiction is not acceptable (no stale weaker communication after under-review truth is established).
3. If stale-sequence risk exists, weaker communication is suppressed.

---

## 6) Customer-Facing Semantic Contract

Future implementation under this freeze must preserve strict separation among:
1. Payment truth.
2. Order truth.
3. Fulfillment mode truth.
4. Readiness truth.
5. Completion truth.
6. Dispatch/in-motion truth.
7. Internal/operator truth.

What may be communicated together:
- Order reference + under-review class meaning + clear next-step expectation + account/detail anchor.

What must remain contextual (only when truthful/relevant):
- Clarifying that review is active and customer action is or is not required.

What must never be collapsed:
- Payment recognized vs final confirmation.
- Under review vs cancellation/failure finality.
- Under review vs readiness/completion/dispatch progression.

What must never be shown raw:
- Internal remediation notes, operator diagnostics, adjudication tags, risk signals, queue labels, or audit-only reason codes.

What must not be over-claimed:
- Resolution timing certainty.
- Outcome certainty.
- Progress stage beyond under-review truth.

---

## 7) Under-Review Wording Posture Contract

Required wording posture:
1. Calm.
2. Clear.
3. Non-technical.
4. Non-alarmist.
5. Truthful about active review and current uncertainty.

Wording constraints:
1. Must not imply failure unless failure truth is already authoritative and customer-safe.
2. Must not imply confirmation/readiness/completion/dispatch progression.
3. Must not expose raw remediation/operator language.
4. Must avoid blame, panic cues, and speculative causes.

Forbidden tone/examples (class-level, not final copy):
- Panic framing (e.g., emergency/problem escalation tone not backed by customer-safe truth).
- False reassurance implying guaranteed imminent resolution.
- Internal-jargon explanations that reduce customer comprehension.

---

## 8) Information Hierarchy Inside Under-Review Communication

### 8.1 Primary (must appear)
1. Order reference.
2. Clear under-review status statement.
3. What this means now in customer-safe terms.
4. Explicit whether customer action is required now (default: no action unless truth says otherwise).

### 8.2 Secondary (useful when applicable)
1. Brief next-step guidance.
2. Link/path to account order detail as authoritative self-service anchor.
3. Calm expectation framing without over-promising timing.

### 8.3 Contextual (shown only when relevant and truthful)
1. Limited additional context needed for comprehension.
2. Narrow degraded notice when detail may lag or be limited.

### 8.4 Internal (never shown raw)
1. Operator-only cause codes.
2. Remediation queue metadata.
3. Internal audit trails.
4. Internal confidence/risk scoring.

---

## 9) Degraded / Failure Handling Contract

Degraded handling requirements:
1. If truth becomes stale before send: suppress send.
2. If system truth is uncertain/ambiguous: suppress send.
3. If stronger/newer truth exists: suppress under-review send and defer to stronger class contract.
4. If provider send fails: do not claim delivery; preserve truthful bounded outcome visibility for operators.
5. If account detail already shows newer truth: do not emit stale under-review semantics.
6. If operationally degraded: prefer truthful minimal communication or suppression; never fabricate certainty.

Mandatory posture:
- Under-review communication must remain truthful and **fail closed** under uncertainty.

---

## 10) Relationship with Account/List/Detail Surfaces

Contract alignment requirements:
1. Under-review wording must align with customer-safe account list/detail semantics.
2. Communication may summarize but must not exceed or contradict account truth.
3. Account order detail remains the customer self-service anchor.
4. Under-review communication should route customer back to account/order detail where appropriate.

---

## 11) Bounded Admin/Operator Implications

Minimum implications frozen in this slice:
1. Operators must have confidence that any under-review communication corresponds to valid customer-safe truth.
2. Silent duplicate sends are forbidden.
3. Silent contradictory sends are forbidden.
4. Bounded outcome visibility must exist for created/suppressed/failed send-attempt states.

Out of scope:
- Broad messaging operations platform design.

---

## 12) Deferred Decisions

Intentionally deferred beyond B7.3:
1. Exact provider choice.
2. Exact runtime outbox/job design.
3. Exact template markup/HTML.
4. Exact DB schema.
5. Multi-channel expansion.
6. Preference management.
7. Broader issue-resolution communication platform.
8. Later stronger/final communication class implementations.

---

## 13) Strict Recommendation

After B7.3, open exactly one bounded runtime/provider-neutral slice for **under-review** transactional communication aligned to this contract; do not begin broad notification platform implementation.

---

## 14) Acceptance Checklist (Binary)

- [PASS] Docs-only contract freeze; no runtime/provider/template/schema implementation.
- [PASS] Exactly one communication class frozen: `under_review`.
- [PASS] Trigger legitimacy boundary is explicit, fail-closed, anti-race, and anti-duplication.
- [PASS] Pending-confirmation vs under-review relationship is explicit and non-contradictory.
- [PASS] Semantic separation across payment/order/fulfillment/readiness/completion/dispatch/internal truth is explicit.
- [PASS] Wording posture, information hierarchy, and degraded handling are explicitly frozen.
- [PASS] Account/list/detail alignment is explicit; communication does not outrun customer-visible truth.
- [PASS] Deferred implementation decisions remain deferred; no platform widening.
