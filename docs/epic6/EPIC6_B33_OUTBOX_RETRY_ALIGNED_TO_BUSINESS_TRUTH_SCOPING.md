# EPIC-6.B3.3 — Outbox / Retry Aligned to Business Truth (Scoping Checkpoint)

- Type: Scoping checkpoint (docs-only)
- Status: Frozen for B3.3 scoping
- Date (UTC): 2026-04-07
- Canonical scope alignment reference: `main@417c0910b7e3a9a41755517f3153b6c068646382` (warning-only mismatch handling per checkpoint note)

---

## 1) Scope and Non-Goals

This slice is a **docs-only scoping checkpoint** for B3.3.

In scope:
- Freezing one bounded implementation seam for first outbox/retry work.
- Freezing first-slice communication class scope.
- Freezing retry/idempotency responsibility boundary at scoping level.

Non-goals (explicit):
- No implementation yet.
- No transport code yet.
- No outbox schema yet.
- No retry engine yet.
- No provider integration changes yet.
- No refund/reversal execution.
- No remediation workflow tooling.
- No broad communications platform redesign.

---

## 2) Why This Scoping Checkpoint Is Required

B3.3 couples business-truth emission with delivery reliability.

Without seam control, work can drift into broad messaging architecture (multi-channel, multi-provider, multi-state) and violate frozen B2/B3 boundaries.

Implementation must stay narrowly bounded and truth-aligned.

---

## 3) Binding Upstream Constraints

Any B3.3 implementation must remain aligned to:
- B2.1 state policy,
- B2.2 refund/reversal boundary,
- B2.3 operator/runbook boundary,
- B3.0 customer semantics,
- B3.1 trigger policy,
- B3.2 wording constraints.

These constraints are binding; B3.3 cannot weaken or reinterpret them.

---

## 4) Candidate Communication Classes / Events

Candidate classes discussed for first implementation:
- Acknowledged
- Pending confirmation
- Under review
- Cancelled
- Confirmed
- Ready for pickup / local fulfillment ready

### First-slice selection (strict)
**In scope for first B3.3 implementation slice:**
- **Under review** only, tied to explicit non-converged success-emission block.

**Deferred from first slice:**
- Acknowledged,
- Pending confirmation,
- Cancelled,
- Confirmed,
- Ready.

### Justification
- Under-review on boundary-blocked success path is highest anti-contradiction value with smallest seam.
- Confirmed/Ready classes carry strongest overstatement risk and need broader readiness surface.
- Acknowledged/Pending/Cancelled require additional lifecycle trigger mapping beyond one bounded seam.

---

## 5) Chosen Bounded Seam

### Chosen seam (single seam only)
**Stripe webhook success-emission boundary block path** in existing `POST /api/webhooks/stripe` handling, specifically when the route returns `ignored: true, reason: 'success_emission_blocked'` after `enforceWebhookSuccessEmissionBoundary(...)`.

### Why this is the smallest legitimate seam
- One event source family (`payment_intent.succeeded` webhook path).
- One decision point already aligned with R4/R5 boundary gating.
- One bounded non-success communication class (`Under review`).

### Why broader seams are rejected now
- Adding PayPal in same slice introduces second seam and larger parity matrix.
- Adding create-intent/order routes broadens into lifecycle-wide messaging.
- Adding confirmed/cancelled/ready in same slice broadens trigger and wording matrices beyond bounded first implementation.

---

## 6) Responsibility Boundary for B3.3 Implementation

### B3.3 first implementation may be responsible for
- Emitting/queuing **only** business-approved `Under review` communication for the chosen seam.
- Enforcing transport idempotency for that single seam/class combination.
- Ensuring emission does not bypass B3.1 trigger blocking rules.

### B3.3 first implementation must not be responsible for
- Redesigning all customer notifications.
- Multi-channel orchestration.
- Provider-wide parity across all webhook families.
- Broad class coverage in one change set.

---

## 7) Retry / Idempotency Scoping Boundary

First-slice retry responsibility:
- Bounded retry for one seam/class only (`stripe success_emission_blocked` -> `Under review`).

Required idempotency guarantee:
- No duplicate customer sends for same intended communication unit at chosen seam.

Future work (deferred):
- Global retry orchestration across all classes/channels.
- Cross-provider dedup unification.
- Full communication idempotency taxonomy.

---

## 8) Stop Conditions / Re-Plan Triggers

Stop implementation and re-plan if any occurs:
1. More than one event seam is required.
2. In-scope classes expand beyond `Under review` for first slice.
3. Provider abstraction/redesign becomes necessary.
4. Outbox/retry scope broadens toward full messaging platform behavior.
5. B2/B3 truth/trigger constraints cannot map cleanly to chosen seam.

---

## 9) Implementation Entry Criteria

Before coding B3.3:
1. Chosen seam is explicitly frozen (single seam).
2. In-scope semantic class set is frozen (`Under review` only).
3. Deferred classes are explicitly out of scope.
4. Success/failure proof criteria are defined.
5. No contradiction with B2/B3 freezes remains.

---

## 10) Implementation Exit Criteria

B3.3 first slice is complete only when proven:
1. Bounded seam only (no secondary seam drift).
2. No semantic contradiction with B2/B3 constraints.
3. Idempotent/no-duplicate send guarantee for in-scope seam/class.
4. Retry behavior is bounded and deterministic.
5. No drift into broader messaging platform responsibilities.
6. Gates/checks are green for the bounded slice.

---

## 11) Explicitly Out of Scope After This Checkpoint

Deferred major items:
1. Full messaging platform.
2. Multi-channel orchestration.
3. Broad provider abstraction redesign.
4. Full remediation communications matrix.
5. Refund/reversal communications implementation (unless separately justified later).

---

## 12) Strict Recommendation

Do not implement B3.3 until the first communication seam, in-scope semantic classes, and retry/idempotency boundary are all explicitly frozen by this checkpoint.

---

## 13) Acceptance Checklist (Binary PASS/FAIL)

- [x] PASS: Docs-only scoping checkpoint; no runtime/outbox/retry implementation content.
- [x] PASS: One exact bounded seam is chosen and justified.
- [x] PASS: In-scope vs deferred communication classes are explicit.
- [x] PASS: Responsibility boundary is explicit and anti-drift.
- [x] PASS: Retry/idempotency boundary is scoped for first slice only.
- [x] PASS: Stop conditions are explicit and enforce re-plan discipline.
- [x] PASS: Entry/exit criteria are explicit and bounded.
- [x] PASS: Out-of-scope items remain explicit and non-expanded.
- [x] PASS: One strict recommendation is present.

