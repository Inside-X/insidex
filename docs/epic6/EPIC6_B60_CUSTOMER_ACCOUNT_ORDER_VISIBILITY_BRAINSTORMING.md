# EPIC6 — B6.0 Customer Account / Order Visibility Brainstorming

- Type: Brainstorming (docs-only)
- Status: Drafted for B6.0 (not frozen)
- Date (UTC): 2026-04-17
- Scope alignment reference: `main@0af3b787e4de004e05b93d208e4b1518c96c271a` (branch/SHA mismatch is warning-only unless lineage is inconsistent)

---

## 1) Scope and Non-Goals

This slice is a **docs-only brainstorming slice** for the first bounded customer account/order visibility layer.

This slice is explicitly:
- not yet a contract freeze,
- not an implementation plan,
- not a runtime delivery.

Non-goals (explicit):
- No account/order page implementation.
- No final API payload definition.
- No final DB schema definition.
- No final UI component/page definition.
- No full design-system definition.
- No redesign of payment/order/fulfillment truth separation.
- No definition of all future customer-account capabilities.
- No reopening of B2/B4/B5 frozen semantics.

---

## 2) Problem Statement

After placing an order, the customer needs one trustworthy place to understand what happened and what is happening next.

Current risk to avoid: customer-facing order/account visibility can become ambiguous if internal state language leaks directly or if distinct truths (payment/order/fulfillment/readiness/completion/dispatch) are collapsed.

Product problem to solve in this line:
1. Provide readable, coherent visibility into a customer’s own orders.
2. Keep the interpretation burden off the customer (no backend jargon decoding).
3. Reduce confusion and support confidence through clear, bounded semantics.
4. Preserve strict truth alignment with existing frozen business and fulfillment boundaries.

---

## 3) Customer Goals Brainstorm (Non-Frozen)

Likely first-layer customer goals:
1. See order history quickly.
2. Open one order and understand current state without guessing.
3. Understand what was ordered (items, quantities, key totals) at practical detail level.
4. Understand what happens next (or whether action is needed).
5. See key dates/events at useful granularity (placed, paid-recognized if applicable, readiness, completion; dispatch/in-motion only when truthful and relevant).
6. See fulfillment mode clearly (`pickup_local` vs `delivery_local`) with mode-appropriate wording.
7. See payment state wording that does not overstate finality.
8. Find critical information fast without visual overload.
9. Receive reassurance when nothing is wrong, and clear non-alarming guidance when data is limited.

Brainstorming note: this list is directional and intentionally not a frozen contract.

---

## 4) Information Hierarchy / Display Coherence Brainstorm

### 4.1 Primary (always visible in list + detail header)
Likely primary fields:
1. Customer-facing order identifier (stable and easy to reference).
2. Order placed date/time (customer timezone-aware presentation later).
3. Current customer-facing status label (bounded semantic class, not raw internal state).
4. Fulfillment mode label (`pickup_local` / `delivery_local` translated to customer wording).
5. Compact item summary (item count + short human-readable summary).

### 4.2 Secondary (detail view default body)
Likely secondary fields:
1. Itemized order content with quantities and price context.
2. Timeline-like key events relevant to customer truth (not full internal audit event stream).
3. Payment recognition/confirmation wording with explicit non-overclaim posture.
4. Readiness/completion information when present and mode-compatible.
5. Practical contact/fulfillment details already validated at order time.

### 4.3 Contextual (shown only when relevant)
Likely contextual fields:
1. Dispatch/in-motion visibility only for `delivery_local` and only when truthful seam exists.
2. Degraded-information notices only when data is temporarily limited.
3. Under-review or pending-confirmation messaging only when applicable.
4. Optional notes only when policy-authorized and customer-safe.

### 4.4 Hidden from customer (internal/misleading if exposed raw)
Must remain hidden or transformed:
1. Raw internal route/state names.
2. Internal operator/audit notes.
3. Raw remediation/reconciliation class labels.
4. Raw replay/duplicate/internal adjustment semantics.
5. Internal error class names and diagnostic reason codes.

### 4.5 Explicit field-specific clarity constraints
1. **Order identifier visibility**: visible in list + detail; stable reference anchor.
2. **Order date visibility**: visible in list + detail; avoid ambiguity of relative-only time.
3. **Current status**: one customer-safe semantic label, backed by separated underlying truths.
4. **Fulfillment mode**: always explicit; never inferred indirectly from status text alone.
5. **Item summary**: concise in list; complete details in detail page.
6. **Payment wording**: “recognized/confirmed/pending” must remain semantically accurate and non-collapsed.
7. **Readiness/completion wording**: mode-aware and distinct; no generic “shipped” collapse.
8. **Operational notes**: no direct leakage of internal remediation/operator language.

---

## 5) Semantic Clarity Brainstorm

Customer-facing account/order surfaces must preserve explicit separation among:
1. **Payment truth** (recognized/confirmed/under review as applicable).
2. **Order truth** (accepted/confirmed/cancelled etc., per existing policy boundaries).
3. **Fulfillment mode truth** (`pickup_local` vs `delivery_local`).
4. **Readiness truth** (ready state is not completion).
5. **Completion truth** (completed state is not merely ready).
6. **Dispatch/in-motion truth** (if present, delivery-only and distinct from readiness/completion).
7. **Internal operator truth** (internal, non-customer-facing except translated outcomes).

Anti-confusion rules for future implementation:
- Do not collapse multiple truths into one vague customer label.
- Do not allow payment recognition to imply fulfillment readiness/completion.
- Do not allow readiness to imply dispatch or completion.
- Do not allow completion to fabricate prior dispatch history.
- Keep customer wording aligned to frozen B2/B3/B4/B5 semantics and fail-closed discipline.

---

## 6) UX / Ergonomics Brainstorm (Behavior-Level)

Good ergonomics for first-layer account/order visibility likely means:
1. Minimal friction: customer can locate relevant order quickly.
2. Strong readability: high signal-to-noise, predictable text density.
3. Consistent hierarchy: same meaning appears in same structural place across orders.
4. Progressive disclosure: list view concise, detail view richer, no forced overload.
5. Clear grouping: “what it is,” “where it stands,” “what happens next,” “order contents.”
6. Mobile-aware density: essential facts visible early without long scanning.
7. Reassurance posture: clear next-step/no-action-needed cues where truthful.
8. Graceful low-data handling:
   - no-orders state,
   - missing optional fields,
   - degraded/limited data periods,
   - old orders with compact but readable representation.
9. Consistent semantics across surfaces (list vs detail must not contradict).

No component design is defined in this slice.

---

## 7) Visual Coherence Brainstorm (Principles Only)

Future implementation should respect these visual-direction constraints:
1. Pleasant and fluid customer experience.
2. Coherent, calm presentation (not operational-console tone).
3. Minimal but informative information surfaces.
4. Modern, clean, highly readable visual language.
5. Avoid clutter and admin-like dense telemetry presentation.
6. Keep key status and fulfillment facts visible without aggressive noise.
7. Avoid visual emphasis patterns that imply false urgency or false certainty.

No mockups or visual system implementation are defined here.

---

## 8) Candidate Customer Surfaces (Bounded Brainstorm)

Likely bounded surfaces for this line:
1. **Account overview** (light summary of recent order visibility and entry points).
2. **Orders list** (history browsing + at-a-glance status/mode/date/value cues).
3. **Order detail** (single-order full readability layer).
4. **Basic profile/contact context (optional/minimal)** only if directly necessary for interpreting order visibility context.

Brainstorm constraint:
- This is not a freeze of IA/site-map.
- This does not commit to full account-platform scope.

---

## 9) What Must Not Be Shown Raw (or Must Be Carefully Translated)

Likely must remain internal or transformed before customer display:
1. Raw internal error classes and stack-oriented diagnostics.
2. Raw rejection classes and reconciliation/remediation internal categories.
3. Raw operator/audit trail notes.
4. Raw replay/duplicate/internal-adjustment semantics.
5. Internal remediation playbook language.
6. Internal route names/state keys that are misleading in customer context.
7. Internal policy/control terms that overexpose security or operations internals.

Translation rule (brainstorm-level):
- customer copy may simplify,
- but must remain truthful and non-contradictory,
- and must not hide consequential customer-facing outcomes.

---

## 10) Edge-Case Visibility Brainstorm (Principles)

Customer-visible handling principles (non-frozen):
1. **No orders yet**:
   - clear empty state,
   - actionable path to browse/start ordering,
   - no technical wording.
2. **Old completed orders**:
   - still discoverable,
   - compact representation,
   - clear completion semantics retained.
3. **Pickup vs delivery**:
   - mode-specific wording preserved everywhere.
4. **Readiness known, dispatch absent**:
   - do not imply in-motion.
   - especially relevant for delivery where dispatch seam may be optional.
5. **Completion known**:
   - completion shown clearly,
   - without inventing additional progression history.
6. **Degraded/limited information availability**:
   - provide honest limited-visibility messaging,
   - no fabricated precision.
7. **Payment recognized but still under review/pending confirmation (if applicable by existing policy)**:
   - explicit non-final wording,
   - no readiness/completion implication.

Constraint: these principles must stay aligned to existing frozen boundaries and must not invent new business policy.

---

## 11) Deferred Decisions (Explicit)

Deferred to subsequent contract-freeze/runtime/UI slices:
1. Final customer status taxonomy and exact mapping rules.
2. Final API contracts and payload shapes.
3. Final persistence/schema adjustments (if any).
4. Final route/controller structure.
5. Final component/page architecture.
6. Final visual tokens, interaction patterns, and micro-animations.
7. Full account-platform expansion beyond first visibility layer.

---

## 12) Strict Recommendation for Next Freeze

Open a dedicated **contract-freeze slice** for the first bounded customer account/order visibility contract **before any runtime or UI implementation**.

---

## 13) Acceptance Checklist (Binary PASS/FAIL)

- [x] PASS: Docs-only brainstorming slice; no runtime/schema/route/UI implementation.
- [x] PASS: Scope and non-goals explicitly prevent contract/implementation drift.
- [x] PASS: Problem statement is customer-trust and visibility clarity oriented.
- [x] PASS: Information hierarchy includes primary/secondary/contextual/hidden classes.
- [x] PASS: Semantic-separation rules explicitly protect payment/order/fulfillment/readiness/completion/dispatch distinctions.
- [x] PASS: UX ergonomics and visual coherence are defined at principle level only.
- [x] PASS: Internal/operator semantics leakage is explicitly blocked.
- [x] PASS: Edge-case visibility principles are included without inventing new policy.
- [x] PASS: Exactly one strict next-step recommendation is present (contract-freeze slice).
