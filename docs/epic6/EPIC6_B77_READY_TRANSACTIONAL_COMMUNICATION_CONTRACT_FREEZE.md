# EPIC-6.B7.7 — Ready Transactional Communication Contract Freeze

- Type: Contract freeze (docs-only)
- Status: Frozen for B7.7
- Date (UTC): 2026-04-24
- Canonical scope alignment reference: `main@96a41428b1950bfc188ce27cee2b2e6c0c249f59` (branch/SHA mismatch is warning-only unless lineage is inconsistent)

---

## 1) Scope and Non-Goals

This slice is a **docs-only contract freeze**.

In scope:
- Freeze exactly one next bounded transactional communication class after B7.6A/B: **ready**.
- Freeze contract boundaries for trigger legitimacy, semantic correctness, fulfillment-mode specificity, wording posture, information hierarchy, degraded/failure handling, account-surface alignment, and bounded operator visibility for this class only.

Non-goals (explicit):
- Not a full notification platform.
- Not multi-channel orchestration.
- Not final provider/runtime/template implementation.
- Not final DB schema.
- Not support/refund portal behavior.
- Not completion communication.
- Not dispatch/in-motion communication.
- Does not redefine frozen payment/order/fulfillment semantics from B2/B3/B4/B6/B7.1/B7.2/B7.3/B7.4/B7.5/B7.6.

---

## 2) Contract Purpose

This freeze defines what **ready** communication must help the customer understand and what it must not imply.

Contract purpose:
1. Prevent outbound messaging that outruns or contradicts authoritative system truth.
2. Provide practical customer clarity on readiness while preserving strict semantic boundaries.
3. Ensure ready communication does not imply completion, collection, delivery, or dispatch/in-motion.
4. Freeze communication quality/readability as correctness requirements, not optional polish.

---

## 3) Frozen Communication Class in Scope

Frozen class in this slice:
- **ready**

Frozen customer meaning:
1. The order is in a customer-safe readiness state tied to its fulfillment mode.
2. The order has progressed beyond `pending_confirmation`, `under_review`, and `confirmed` active semantics.
3. The customer can use account order detail as the authoritative anchor for current state context.

This class does **not** mean:
1. Not equivalent to order received / pending confirmation.
2. Not equivalent to under review.
3. Not equivalent to confirmed.
4. Not equivalent to completed.
5. Not equivalent to cancelled.
6. Not equivalent to dispatch/in-motion.

Distinctness rationale:
- `ready` is a readiness class only.
- It is stronger than `confirmed` for fulfillment progression but weaker than completion, cancellation, and dispatch/in-motion outcome classes.

---

## 4) Mode-Aware Ready Meaning Contract

Ready meaning is frozen by fulfillment mode:

### 4.1 `pickup_local`
- Ready means the order can now be collected according to the local pickup process.
- It may include practical pickup orientation only when truth-safe.
- It must not imply that collection has already happened.

### 4.2 `delivery_local`
- Ready means the order is prepared for the local delivery process.
- It must not imply delivered/completed outcome.
- It must not imply dispatch/in-motion unless a future dedicated dispatch class is truthfully active.

Global mode-aware constraints:
1. No generic carrier-shipping wording.
2. No `shipped` wording.
3. Pickup readiness must not be described as delivery dispatch.
4. Delivery readiness must not be described as delivered/completed.

---

## 5) Trigger Legitimacy Contract

Ready communication is legitimate only when all conditions are true:
1. Authoritative order truth exists for a customer-owned order reference.
2. Authoritative customer-safe status maps to `ready` at send decision time.
3. Authoritative fulfillment mode truth is present and supports a truth-safe ready interpretation.
4. No unresolved partial, ambiguous, stale, or contradictory truth remains.
5. Candidate wording remains bounded to readiness-only meaning.

Ready communication is forbidden when any condition is true:
1. Trigger basis is operator expectation that readiness may happen soon.
2. Trigger basis is partial or inferred readiness evidence without authoritative ready truth.
3. Truth is stale, contradictory, unavailable, or uncertain.
4. Stronger/newer truth already exists (for example completed/cancelled/dispatch-in-motion class once frozen and active).
5. Candidate message would over-claim completion, collection, delivery, or dispatch.

Contract posture:
- Anti-race and anti-duplication are mandatory.
- No send from ambiguous or stale truth.
- Engine internals are intentionally not defined in this freeze.

---

## 6) Relationship with Earlier Classes

Frozen contract relationship among:
- `pending_confirmation`
- `under_review`
- `confirmed`
- `ready`

Rules:
1. `ready` **supersedes** `confirmed` once authoritative ready truth exists.
2. `ready` **supersedes** `under_review` once authoritative ready truth exists.
3. `ready` **supersedes** `pending_confirmation` once authoritative ready truth exists.
4. Historical coexistence is allowed (older weaker messages may exist in timeline/history).
5. Active contradiction is forbidden (no stale/weaker active outbound class once ready truth is authoritative).
6. When sequencing certainty cannot be established, weaker/older class emission is suppressed (fail-closed).

Suppression boundary:
- Once ready truth is authoritative, weaker classes (`pending_confirmation`, `under_review`, `confirmed`) are not eligible for active outbound emission for the same order truth path.

---

## 7) Relationship with Later Classes

Ready is frozen as readiness-only and must not pre-claim:
1. Completed.
2. Collected.
3. Delivered.
4. Cancelled.
5. Dispatch/in-motion.

Boundary rule:
- If later-class truth is not frozen and truthfully active at send-decision time, ready communication must remain strictly bounded to present readiness truth only.

---

## 8) Customer-Facing Semantic Contract

Future implementation under this freeze must preserve strict separation among:
1. Payment truth.
2. Order truth.
3. Fulfillment mode truth.
4. Readiness truth.
5. Completion truth.
6. Dispatch/in-motion truth.
7. Internal/operator truth.

What may be communicated together:
- Ready class meaning + order reference + fulfillment mode-safe context + practical next-step orientation + account/detail anchor.

What must remain contextual:
- Action guidance and operational detail only when relevant and truth-safe.
- Mode-specific practical information only when it does not imply completion/dispatch.

What must never be collapsed:
- Payment truth into readiness truth.
- Confirmed truth into completion/dispatch truth.
- Ready truth into completed/collected/delivered truth.
- Internal/operator handling truth into customer-ready semantics.

What must never be shown raw:
- Internal remediation/operator/audit classifications.
- Internal suppression, dedupe, fallback, or incident reason codes.

What must not be over-claimed:
- Timing promises.
- Collection/delivery completion.
- Dispatch/in-motion state.
- Operational certainty beyond authoritative ready truth.

---

## 9) Ready Wording Posture Contract

Ready wording posture is frozen as:
- Calm.
- Clear.
- Practical.
- Non-technical.
- Fulfillment-mode aware.
- Reassuring without over-promising.
- Explicitly bounded away from completed/delivered/collected/dispatched implications.
- Free of raw remediation/operator language.

Required wording qualities:
1. Immediate comprehension without technical interpretation.
2. Practical next-step clarity aligned to fulfillment mode.
3. Modern concise phrasing that lowers uncertainty without inflating promises.

Forbidden tone/content:
1. Generic shipping/carrier phrasing.
2. `shipped` wording for local fulfillment readiness.
3. Alarmist, defensive, noisy, or blame-shifting language.
4. Hidden ambiguity about whether the order is merely ready vs already completed.

---

## 10) Information Hierarchy Inside Ready Communication

### 10.1 Primary (must appear)
1. Clear ready status wording.
2. Order reference.
3. Fulfillment mode label (`pickup_local` vs `delivery_local` customer-safe label).
4. What ready means now for this mode.
5. Whether customer action is required now (explicit yes/no; default no unless truth says otherwise).

### 10.2 Secondary (useful when applicable)
1. Practical next step aligned to mode when truth-safe.
2. Account/order-detail link or path as self-service anchor.

### 10.3 Contextual (show only when relevant and truth-safe)
1. Pickup-local practical orientation (for example, where/how pickup process proceeds) when already customer-safe.
2. Delivery-local practical orientation (prepared for local delivery process) without implying dispatch or delivery completion.

### 10.4 Internal (never shown raw)
1. Internal remediation/operator/audit diagnostics.
2. Internal trigger/suppression/deduplication codes.
3. Internal uncertainty handling details.

---

## 11) Degraded / Failure Handling Contract

Ready communication must remain truthful and fail-closed under degraded conditions.

Required degraded handling rules:
1. If truth becomes stale before send, suppress ready send.
2. If the system is uncertain, ambiguous, or missing required truth, suppress ready send.
3. If stronger/newer truth exists, suppress stale ready candidate.
4. If provider send fails, do not claim delivery/receipt success; preserve truthful bounded retry/suppression posture for later runtime slices.
5. If account detail already shows newer truth, do not emit stale ready communication.
6. If readiness evidence is partial, do not infer readiness; suppress.
7. Under operational degradation, prefer no-send over risky over-claim.

Contract posture:
- Under uncertainty: fail closed.
- Under contradiction risk: suppress stale/weaker/incorrect class.
- Under delivery uncertainty: no fabricated receipt assertions.

---

## 12) Relationship with Account/List/Detail Surfaces

Alignment rules:
1. Ready communication wording must remain semantically aligned with account list/detail customer truth.
2. Communication may summarize but must not exceed, outrun, or contradict account/order detail truth.
3. Account/order detail remains the customer self-service anchor for latest truthful state.
4. Ready communication should direct customers back to account/order detail when deeper context is needed.

---

## 13) Bounded Admin/Operator Implications

Minimum bounded implications frozen at this stage:
1. Operators/admins must have confidence that ready communication eligibility maps to valid authoritative readiness truth.
2. Silent duplicate ready sends are forbidden by contract.
3. Silent contradictory ready sends are forbidden by contract.
4. Bounded outcome visibility is required (created/suppressed/deduped/fail-closed posture) without designing a broad messaging operations platform.

---

## 14) Deferred Decisions

Intentionally deferred after B7.7:
1. Exact provider choice and integration.
2. Exact runtime outbox/job orchestration.
3. Exact template markup/HTML.
4. Exact DB schema/index model for communication lifecycle.
5. Multi-channel expansion and orchestration.
6. Preference management.
7. Completed/cancelled/dispatch communication class freezes and runtime slices.
8. Broader messaging platform behavior.

---

## 15) Strict Recommendation

After this B7.7 freeze, open exactly one bounded runtime/provider-neutral slice for **ready** communication aligned to this contract; do not initiate broad notification platform implementation.

---

## 16) Acceptance Checklist (PASS/FAIL)

1. [PASS] Exactly one communication class is frozen in this slice: `ready`.
2. [PASS] Scope is docs-only and excludes provider/runtime/template/schema/platform implementation.
3. [PASS] Mode-aware ready meaning is explicitly separated for `pickup_local` and `delivery_local`.
4. [PASS] Trigger legitimacy boundaries are explicit, anti-race/anti-duplication, and fail-closed under uncertainty.
5. [PASS] Relationship/supersession rules vs earlier classes (`pending_confirmation`, `under_review`, `confirmed`) are explicit.
6. [PASS] Relationship boundaries vs later classes (completed/collected/delivered/cancelled/dispatch) are explicit and non-pre-claiming.
7. [PASS] Semantic separation across payment/order/mode/readiness/completion/dispatch/internal truths is explicit.
8. [PASS] Wording posture contract forbids `shipped` and generic shipping language for local readiness.
9. [PASS] Information hierarchy clearly separates primary/secondary/contextual/internal content.
10. [PASS] Degraded/failure handling is explicit, truthful, and fail-closed.
11. [PASS] Account/list/detail alignment is explicit and preserves account detail as anchor.
12. [PASS] Deferred decisions remain bounded; no broad notification platform scope is opened.
