# EPIC6 — B6.1 First Customer Account / Order Visibility Contract Freeze

- Type: Contract freeze (docs-only)
- Status: Frozen for B6.1
- Date (UTC): 2026-04-17
- Canonical scope alignment reference: `main@3596f931068fafbda9beccbdc3da831567f9de0f` (branch/SHA mismatch is warning-only unless lineage is inconsistent)

---

## 1) Scope and Non-Goals

This slice is a **docs-only contract freeze**.

This freeze covers **only** the first bounded customer account/order visibility layer:
- first customer entry to order visibility,
- orders list visibility,
- order detail visibility,
- customer-safe semantics and presentation constraints for those surfaces.

Non-goals (explicit):
- Not full account-platform design.
- Not final API payload/schema/runtime/UI implementation.
- Not a full design system.
- Not a redesign of payment/order/fulfillment truth separation.
- Not the full future customer-account capability map.
- Not a reopening of B2/B3/B4/B5 frozen semantics.

---

## 2) Contract Purpose

This freeze defines what the first customer account/order visibility layer must help the customer understand and do:
1. Understand their own order history.
2. Understand one order’s current customer-visible state.
3. Understand practical next-step/no-action-needed context.

Binding intent:
- Customer must not be forced to decode backend/internal semantics.
- Visibility must remain truthful, coherent, readable, and practically useful.
- UX/presentation coherence is part of this contract boundary, not an optional later concern.

---

## 3) Bounded Customer Surfaces in Scope

In-scope surfaces (frozen):
1. **Order visibility entry surface** (minimal, account-facing entry into order history).
2. **Orders list** (history view with concise, comparable summaries).
3. **Order detail** (single-order deeper visibility).

Out of scope for B6.1:
1. Full profile/preferences/security account platform.
2. Loyalty, returns portal, subscription management, or broad post-purchase platform.
3. Multi-surface redesign beyond first bounded order-visibility layer.

---

## 4) Information Hierarchy Contract

### 4.1 Primary (immediately visible)
Must be visible at list level and reinforced at detail header:
1. Customer-facing order identifier.
2. Order date/time.
3. Customer-facing current status (customer semantic class, not raw internal state key).
4. Fulfillment mode (`pickup_local` vs `delivery_local`, customer-safe wording).
5. Compact item summary (count + compact textual summary).

### 4.2 Secondary (detail-visible default)
Must be visible on order detail by default:
1. Itemized order detail (name/quantity/price context).
2. Totals/payments wording at customer-safe clarity level.
3. Mode-aware readiness/completion visibility when truthful and present.
4. Mode-aware practical fulfillment facts captured at order truth time.

### 4.3 Contextual (only when relevant)
Must appear only when contextual conditions are true:
1. Dispatch/in-motion visibility only for `delivery_local` and only when truthful seam is present.
2. Degraded/limited-information notice only when visibility is genuinely degraded.
3. Under-review/pending confirmation context only when semantically required by current truth.

### 4.4 Internal/hidden (never shown raw)
Must not be rendered raw to customer surfaces:
1. Internal notes, operator remarks, audit-oriented raw text.
2. Internal classification names, remediation/reconciliation classes.
3. Raw replay/duplicate/internal adjustment semantics.
4. Internal route names/state-machine names/error classes.

---

## 5) Customer-Facing Semantic Contract

Customer surfaces must preserve strict separation among:
1. Payment truth.
2. Order truth.
3. Fulfillment mode truth.
4. Readiness truth.
5. Completion truth.
6. Dispatch/in-motion truth.
7. Internal/operator truth.

Hard prohibitions:
1. Never collapse these truths into one vague status label.
2. Never imply fulfillment readiness/completion from payment recognition alone.
3. Never imply completion from readiness alone.
4. Never imply dispatch/in-motion from readiness alone.
5. Never show internal/operator truth raw as customer-facing status semantics.
6. Never reuse `shipped` as canonical local-fulfillment truth.

---

## 6) Customer Status Contract (First-Layer, Customer-Facing)

This freeze defines customer-facing status posture only; no DB enum is defined here.

### 6.1 Status classes required for first-layer mapping
Later implementation must map to bounded customer-facing classes that remain truth-aligned:
1. **Order received / pending confirmation** (non-final).
2. **Under review** (non-final, explicit issue handling territory).
3. **Confirmed** (final success at order-level boundary).
4. **Ready** (mode-aware readiness; never pre-confirmation).
5. **Completed** (mode-aware completion; not equivalent to readiness).
6. **Cancelled** (order cancellation boundary; separate from monetary completion semantics).

### 6.2 Visibility rules for status classes
1. One primary status class must be visible on list/detail header.
2. Supplemental explanatory text may appear contextually on detail.
3. Under-review/degraded context must be explicit when applicable.
4. Dispatch/in-motion must be contextual, not forced as universal primary status.

### 6.3 Non-overclaim requirements
1. Do not claim finality where truth is non-final.
2. Do not claim readiness where readiness truth is absent.
3. Do not claim completion where completion truth is absent.
4. Do not claim dispatch/in-motion where dispatch seam truth is absent.

### 6.4 Degraded wording binding
When detail is unavailable or intentionally reduced:
- degrade to truthful neutral wording,
- do not fabricate precision,
- do not present degraded state as ordinary success.

---

## 7) UX / Ergonomics Contract

Future implementation for this first layer must satisfy all of the following:
1. Low friction to locate the intended order.
2. Readability-first presentation (high signal, low cognitive load).
3. No visual overload in list or detail default states.
4. Consistent placement of key facts across orders/surfaces.
5. Clear grouping of meaning (identity/status/items/financial summary/what-next).
6. Mobile-friendly information density and scanning order.
7. Obvious reassurance/next-step context where relevant.
8. Graceful handling of no-orders, low-data, and missing optional fields.
9. Strong coherence between list summary and detail representation (no contradictions).

No component designs are defined in this freeze.

---

## 8) Visual / Presentation Contract

Future UI implementation must satisfy these presentation constraints:
1. Modern, clean, customer-appropriate presentation.
2. Pleasant, fluid interaction feel (without semantic distortion).
3. Calm, coherent visual hierarchy.
4. Informative surfaces without clutter.
5. Important status visibility without aggressive visual noise.
6. Avoidance of admin-console density and operational telemetry style on customer surfaces.
7. Legibility and scanability as first-class constraints.

No mockups, token systems, or component libraries are defined here.

---

## 9) Surface-Specific Contract Guidance

### 9.1 Orders list
Must provide fast scanning and comparison across orders:
- order identifier,
- date,
- primary customer status,
- fulfillment mode,
- compact item summary.

### 9.2 Order detail
Must provide deeper understanding without semantic overload:
- item detail,
- totals/payment wording,
- readiness/completion context,
- dispatch/in-motion context only when applicable/truthful,
- contextual explanation for non-final/degraded cases when needed.

### 9.3 Empty state (no orders)
Must be explicit, calm, and actionable without technical jargon.

### 9.4 Old completed orders
Must remain readable and discoverable without unnecessary visual weight.

### 9.5 `pickup_local` vs `delivery_local`
Must remain explicitly mode-aware in status and explanatory wording.

### 9.6 Readiness known but dispatch absent
Must not imply in-motion. Especially relevant for delivery where dispatch track is optional.

### 9.7 Completion known
Must show completion clearly without inventing intermediate events.

### 9.8 Degraded/limited information availability
Must show truthful limitation messaging; must not over-claim certainty.

---

## 10) Internal-to-Customer Translation Boundary

Later implementation must translate/suppress/reshape before display:
1. Raw internal states and transition keys.
2. Raw operator notes and audit annotations.
3. Raw remediation/reconciliation classes.
4. Raw replay/duplicate/internal adjustment semantics.
5. Raw internal errors/reason codes.
6. Internal route/state names that mislead customer understanding.

Translation rule:
- customer representation may simplify,
- but must never contradict or overstate underlying truth.

---

## 11) Deferred Decisions

Intentionally deferred beyond B6.1:
1. Exact API payload field contract.
2. Exact DB schema needs.
3. Exact runtime route/controller structure.
4. Exact component/page architecture.
5. Exact visual token/animation system.
6. Full account-platform expansion beyond first order-visibility layer.

---

## 12) Strict Recommendation

After this B6.1 freeze, open exactly one bounded next slice for first customer order-visibility runtime preparation/implementation aligned to this contract, and do not start broad account-platform implementation that bypasses or weakens this contract.

---

## 13) Acceptance Checklist (Binary PASS/FAIL)

- [x] PASS: Docs-only contract freeze with first-layer account/order visibility scope explicitly bounded.
- [x] PASS: Information hierarchy is frozen across primary/secondary/contextual/internal classes.
- [x] PASS: Customer semantic separation is frozen without truth collapse.
- [x] PASS: Customer status posture is frozen at customer-semantic class level (no DB enum leakage).
- [x] PASS: UX/ergonomics and visual/presentation constraints are explicit and binding.
- [x] PASS: Surface-specific guidance covers list/detail/empty/old/completion/readiness-dispatch/degraded cases.
- [x] PASS: Internal-to-customer translation boundary is explicit and fail-safe.
- [x] PASS: Deferred items remain bounded and implementation-neutral.
- [x] PASS: Exactly one strict recommendation is present.
