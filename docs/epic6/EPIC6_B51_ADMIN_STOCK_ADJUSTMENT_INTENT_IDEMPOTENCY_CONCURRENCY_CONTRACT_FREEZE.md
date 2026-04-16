# EPIC-6.B5.1 — Admin Stock Adjustment Intent / Idempotency / Concurrency Contract Freeze

- Type: Contract freeze (docs-only)
- Status: Frozen for B5.1
- Date (UTC): 2026-04-16
- Canonical scope alignment reference: `main@6821cd8253cc9a9c86748faadefb36c23d19eb55` (branch/SHA mismatch is warning-only unless lineage is inconsistent)

---

## 1) Scope and Non-Goals

This slice is a **docs-only contract freeze**.

In scope (frozen):
- Policy meaning of admin stock-adjustment intent.
- Policy boundary for idempotency/replay/duplicate/new-intent separation.
- Policy boundary for concurrency-class separation.

Non-goals (explicit):
- No runtime implementation.
- No schema/API/UI implementation.
- No warehouse-management design.
- No broader inventory architecture redesign.
- No payment/finalization/remediation redesign.
- No generic admin stock-editing model.

---

## 2) Contract Purpose

This freeze defines what an admin stock adjustment is allowed to mean.

Later implementation must not infer admin intention loosely.

All inventory-affecting actions must remain deterministic, fail-closed, and auditable.

---

## 3) Allowed Intention Classes (Frozen)

Admin stock adjustment intent class is **mandatory** and **authoritative**. Free-form narrative cannot substitute for intent class.

Only the following intention classes are allowed in principle:

1. **RECOUNT_CORRECTION**
   - Correction after authoritative physical recount confirms discrepancy.
2. **DAMAGE_LOSS_CORRECTION**
   - Correction after confirmed damage/loss/shrinkage truth.
3. **AUTHORIZED_RESTORATION**
   - Controlled restoration only after already-authoritative reversal/remediation truth exists and is non-contradictory.

No additional intention class is allowed unless introduced by a future contract freeze.

---

## 4) Forbidden / Non-Authoritative Intention Patterns (Frozen)

The following are forbidden as authoritative intent:

1. Vague intent labels (e.g., “fix stock”).
2. Convenience intent (e.g., “make checkout work”).
3. Guess-based intent (e.g., “probably wrong stock”).
4. Free-form narrative as sole authority.
5. Fuzzy or guessed recovery actions.
6. Any action that silently compensates unknown failure without confirmed truth.

---

## 5) Idempotency Semantic Boundary (Frozen)

The following classes are distinct and non-interchangeable:

1. **Replay of prior known outcome**
2. **Duplicate request**
3. **New intended adjustment**

Frozen rules:
- Sameness must not be inferred by fuzzy matching.
- Superficial payload similarity is insufficient for authoritative sameness classification.
- Uncertain retry must not default to a new stock mutation.
- Safe replay requires authoritative sameness criteria and prior outcome linkage, not heuristic guesswork.

---

## 6) Concurrency Boundary (Frozen)

Later implementation must treat these as distinct concurrency classes:

1. Same admin repeated submit.
2. Different admins concurrent on same target.
3. Admin adjustment colliding with live runtime stock movement.
4. Stale admin snapshot versus current authoritative truth.
5. Partial persistence success versus partial audit-write failure.

Frozen rule:
- These classes must not collapse into one generic “conflict” notion.

---

## 7) Target Identity Boundary (Frozen)

- Admin stock adjustment must target authoritative stock-bearing identity.
- SKU may participate only as identity resolver if later implemented.
- SKU must never become quantity authority.
- Ambiguous target identity is forbidden.

---

## 8) Deterministic Outcome Policy (Frozen)

Later implementation must distinguish deterministic outcome classes at minimum:

1. **APPLIED**
2. **REJECTED**
3. **REPLAYED_PRIOR_OUTCOME**
4. **CONFLICT_CONCURRENT_CONTRADICTION**
5. **INVALID_INTENT**
6. **INVALID_TARGET**
7. **INVALID_PRECONDITION**

Fail-closed rule:
- When classification is uncertain, outcome must not be treated as applied.

---

## 9) Boundary with Existing Order / Finalization / Remediation Truth (Frozen)

Admin stock adjustment must never:

1. Silently rewrite order truth.
2. Silently resolve B2 payment-valid-but-stock-not-finalizable outside frozen policy.
3. Act as hidden refund/reversal/finalization workaround.
4. Silently override authoritative runtime stock movement truth.
5. Become a backdoor remediation tool.

---

## 10) Auditability Minimum Contract (Frozen)

Later implementation must preserve minimum authoritative audit dimensions:

1. Actor identity.
2. Timestamp(s).
3. Target identity.
4. Authoritative intent class.
5. Before/after quantity truth.
6. Outcome classification.
7. Authoritative correlation/evidence reference where applicable.

Frozen rule:
- Free-form note alone is insufficient as authoritative stock-adjustment truth.

---

## 11) Fail-Closed Rules (Frozen)

1. No adjustment without authoritative target identity.
2. No adjustment without authoritative intent class.
3. No silent best-effort acceptance under concurrency ambiguity.
4. No silent replay classification under weak sameness evidence.
5. No silent stock correction when runtime/order truth conflicts remain unresolved.
6. No hidden second stock truth via SKU or convenience fields.

---

## 12) Deferred Implementation Questions (Explicitly Deferred)

1. Exact API payload fields.
2. Exact DB schema.
3. Exact idempotency key materialization.
4. Exact concurrency-control mechanism.
5. Exact admin UI flow.
6. Exact evidence/correlation field shape.

---

## 13) Strict Recommendation

Only after this B5.1 freeze, open one bounded implementation-preparatory slice (or runtime slice) that remains strictly aligned to this intent/idempotency/concurrency contract; do not treat this as authorization for broad admin stock API work.

---

## 14) Acceptance Checklist (Binary PASS/FAIL)

- [x] PASS: Docs-only contract freeze with no runtime/schema/API/UI implementation.
- [x] PASS: Intent class is mandatory, bounded, and authoritative.
- [x] PASS: Forbidden/non-authoritative intent patterns are explicitly frozen.
- [x] PASS: Replay vs duplicate vs new-intent boundary is explicitly frozen.
- [x] PASS: Concurrency classes are explicitly distinct and non-collapsed.
- [x] PASS: Target identity boundary preserves authoritative stock truth and SKU constraints.
- [x] PASS: Deterministic outcome classes are explicit and fail-closed.
- [x] PASS: Existing B2/B4/finalization/remediation boundaries are preserved and non-bypassed.
- [x] PASS: Auditability minimum contract is explicit; free-form note is non-authoritative alone.
- [x] PASS: Deferred implementation items are explicit and bounded.
- [x] PASS: One strict recommendation is present.
