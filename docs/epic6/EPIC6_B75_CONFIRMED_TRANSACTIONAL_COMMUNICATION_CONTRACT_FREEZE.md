# EPIC-6.B7.5 — Confirmed Transactional Communication Contract Freeze

- Type: Contract freeze (docs-only)
- Status: Frozen for B7.5
- Date (UTC): 2026-04-23
- Canonical scope alignment reference: `main@91342b59d8851f39e95ad8abf2672b02851377c5` (branch/SHA mismatch is warning-only unless lineage is inconsistent)

---

## 1) Scope and Non-Goals

This slice is a **docs-only contract freeze**.

In scope:
- Freeze exactly one next bounded transactional communication class after B7.4A/B: **confirmed**.
- Freeze contract boundaries for trigger legitimacy, semantic correctness, wording posture, information hierarchy, degraded handling, account-surface alignment, and bounded operator visibility for this class only.

Non-goals (explicit):
- Not a full notification platform.
- Not multi-channel orchestration.
- Not final provider/runtime/template implementation.
- Not final DB schema.
- Not support/refund portal behavior.
- Not fulfillment-readiness communication.
- Does not redefine frozen payment/order/fulfillment semantics from B2/B3/B4/B6/B7.1/B7.2/B7.3/B7.4.

---

## 2) Contract Purpose

This freeze defines what **confirmed** communication must help the customer understand, and what it must not imply.

Contract purpose:
1. Ensure later implementation cannot send confirmed messages that outrun or contradict authoritative system truth.
2. Increase customer clarity and confidence that confirmation exists, without implying readiness, completion, or dispatch/in-motion.
3. Preserve strict semantic separation across payment, order, fulfillment mode, readiness, completion, dispatch, and internal/operator domains.
4. Treat wording quality/readability and calm reassurance as contractual correctness requirements.

---

## 3) Frozen Communication Class in Scope

Frozen class in this slice:
- **confirmed**

Frozen customer meaning:
1. The order is confirmed as a stable customer-safe order truth.
2. The order is no longer in pending-confirmation or under-review active truth classes.
3. The customer may rely on account order detail as the anchor for current status context.

This class does **not** mean:
1. Not equivalent to order received / pending confirmation.
2. Not equivalent to under review.
3. Not equivalent to ready.
4. Not equivalent to completed.
5. Not equivalent to cancelled.
6. Not equivalent to dispatch/in-motion.
7. Not equivalent to “payment alone is good” absent confirmed order truth.

Distinctness rationale:
- `confirmed` communicates stable order confirmation only.
- It is stronger than pending-confirmation and under-review semantics.
- It remains weaker than readiness/completion/dispatch outcome classes and must not pre-announce them.

---

## 4) Trigger Legitimacy Contract

Confirmed communication is legitimate only when all conditions are true:
1. Authoritative order truth exists for a customer-owned order reference.
2. Customer-safe current order status maps to **confirmed** truth (not inferred from payment-only signals).
3. No unresolved contradictory, partial, or ambiguous truth remains at send-decision time.
4. No stronger/newer truth already exists that would make a confirmed message stale or weaker.
5. Candidate wording can remain bounded to confirmed-only meaning without readiness/completion/dispatch over-claim.

Confirmed communication is forbidden when any condition is true:
1. Trigger basis is payment-valid signal alone without customer-safe confirmed order truth.
2. Truth is stale, partial, contradictory, unavailable, or uncertain.
3. A newer stronger class already applies (for example ready/completed/cancelled/dispatch-relevant truth).
4. Candidate message would imply readiness, completion, dispatch/in-motion, or operational certainty not present in truth.

Contract posture:
- Anti-race and anti-duplication are mandatory at contract level.
- Legitimacy must be re-evaluated at send decision boundary; stale candidates are suppressed.
- Engine internals are intentionally not defined in this freeze.

---

## 5) Relationship with Earlier Classes

Frozen relationship among classes:
- Order received / pending confirmation
- Under review
- Confirmed

Contract rules:
1. `confirmed` **supersedes** `pending_confirmation` when confirmed truth exists.
2. `confirmed` **supersedes** `under_review` when confirmed truth exists.
3. Historical coexistence is allowed (older weaker communications may exist in history).
4. Active coexistence that creates contradiction is forbidden (no stale weaker class emission after confirmed truth is authoritative).
5. If sequencing uncertainty exists, weaker/older semantics are suppressed rather than emitted.

Suppression rule:
- Once confirmed truth is authoritative, previously valid weaker semantics (`pending_confirmation`, `under_review`) are no longer eligible for active outbound emission for that order truth path.

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
- Confirmed status meaning + order reference + calm practical next-step orientation + account/detail anchor.

What must remain contextual:
- Fulfillment mode references only when already customer-safe and non-contradictory.
- Customer action guidance only when explicitly required or explicitly not required.

What must never be collapsed:
- Payment-confirmed language into order-confirmed language.
- Order-confirmed language into readiness/completion/dispatch language.
- Under-review internal handling semantics into confirmed success semantics.

What must never be shown raw:
- Internal remediation/audit/operator diagnostic labels.
- Internal suppression/duplicate/error reason codes.

What must not be over-claimed:
- Timing promises.
- Readiness/completion/dispatch outcomes.
- Operational certainty beyond confirmed order truth.

---

## 7) Confirmed Wording Posture Contract

Confirmed wording posture is frozen as:
- Calm.
- Clear.
- Non-technical.
- Reassuring.
- Truthful about confirmation.
- Explicitly bounded away from ready/completed/dispatched implications.
- Free from raw internal/remediation/operator language.

Required qualities:
1. Plain customer-safe language with unambiguous confirmation meaning.
2. Modern concise phrasing that reduces uncertainty without inflating promises.
3. Readable structure where meaning is understandable without domain expertise.

Forbidden tone/content:
1. Alarmist, defensive, blame-shifting, or operationally noisy language.
2. Internal incident/remediation vocabulary presented directly to customer.
3. Ambiguous euphemisms that hide whether confirmation is actually true.
4. Wording that implies fulfillment readiness, completion, or in-motion dispatch.

---

## 8) Information Hierarchy Inside Confirmed Communication

### 8.1 Primary (must appear)
1. Clear confirmed status wording.
2. Order reference.
3. What confirmation means now (bounded confirmed truth only).
4. Whether customer action is required now (default: none unless explicitly true).

### 8.2 Secondary (useful when applicable)
1. Brief fulfillment mode label only when truth-safe and non-overclaiming.
2. Account/order-detail path as customer self-service anchor.

### 8.3 Contextual (show only when relevant and truth-safe)
1. Next-step orientation that stays class-bounded.
2. Limited confidence-oriented clarifiers that do not imply readiness/completion/dispatch.

### 8.4 Internal (never shown raw)
1. Operator/remediation classifications.
2. Internal conflict/suppression/dedupe codes.
3. Internal escalation/audit details.

---

## 9) Degraded / Failure Handling Contract

Confirmed communication must remain truthful and fail-closed under degraded conditions.

Required degraded handling rules:
1. If truth becomes stale before send, suppress confirmed send.
2. If system truth is uncertain/ambiguous/unavailable, suppress confirmed send.
3. If stronger/newer truth exists, suppress or replace stale confirmed candidate per stronger truth.
4. If provider send fails, do not fabricate delivery success; preserve truthful retry/suppression posture in bounded runtime slices.
5. If account order detail already shows newer truth, do not emit stale confirmed communication.
6. If operational state is degraded, prefer no-send over risky over-claim.

Contract posture:
- Under uncertainty: fail closed.
- Under contradiction risk: suppress weaker/stale class.
- Under delivery uncertainty: do not claim customer receipt.

---

## 10) Relationship with Account/List/Detail Surfaces

Contract alignment rules:
1. Confirmed communication wording must remain semantically aligned with account list/detail customer truth.
2. Communication may summarize; it must not exceed, outrun, or contradict account/order detail truth.
3. Account/order detail remains the customer self-service anchor for latest state.
4. Confirmed communication should direct customers to account/order detail when context depth is needed.

---

## 11) Bounded Admin/Operator Implications

Minimum bounded implications frozen at this stage:
1. Operators/admins must be able to trust that confirmed communication eligibility reflects valid authoritative customer-safe truth.
2. Silent duplicate sends are forbidden by contract.
3. Silent contradictory sends are forbidden by contract.
4. Bounded outcome visibility is required (created/suppressed/deduped/fail-closed posture), without opening a broad messaging operations platform design.

---

## 12) Deferred Decisions

Intentionally deferred after B7.5:
1. Exact provider choice and provider integration details.
2. Exact runtime outbox/job orchestration design.
3. Exact template markup/HTML implementation.
4. Exact DB schema/index model for message lifecycle.
5. Multi-channel expansion and cross-channel orchestration.
6. Communication preference management.
7. Ready/completed/cancelled/dispatch communication class freezes and runtime slices.
8. Broad messaging platform operations behavior.

---

## 13) Strict Recommendation

After this B7.5 freeze, open exactly one bounded runtime/provider-neutral slice for **confirmed** communication aligned to this contract; do not initiate broad notification platform implementation.

---

## 14) Acceptance Checklist (PASS/FAIL)

1. [PASS] Exactly one communication class frozen in this slice: `confirmed`.
2. [PASS] Trigger legitimacy boundary is explicit and fail-closed under uncertainty.
3. [PASS] Relationship and supersession rules vs `pending_confirmation` and `under_review` are explicit.
4. [PASS] Semantic separation across payment/order/fulfillment/readiness/completion/dispatch/internal truths is explicit.
5. [PASS] Wording posture includes required qualities and forbidden tones.
6. [PASS] Information hierarchy distinguishes primary/secondary/contextual/internal boundaries.
7. [PASS] Degraded and failure handling rules are explicit and anti-overclaim.
8. [PASS] Account/list/detail alignment contract is explicit.
9. [PASS] Operator/admin implications remain bounded and non-platform.
10. [PASS] Deferred list keeps provider/runtime/template/schema/platform details out of this freeze.
