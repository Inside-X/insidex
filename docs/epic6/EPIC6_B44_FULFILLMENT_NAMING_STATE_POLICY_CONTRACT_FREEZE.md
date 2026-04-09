# EPIC-6.B4.4 — Fulfillment Naming / State Policy Contract Freeze

- Type: Contract freeze (docs-only)
- Status: Frozen for B4.4
- Date (UTC): 2026-04-09
- Canonical scope alignment reference: `main@153a0534999649ab6b7ed2df77f1c33eca306e13` (branch/SHA mismatch is warning-only unless lineage is inconsistent)

---

## 1) Scope and Non-Goals

This slice is a **docs-only contract freeze**.

In scope:
- Freeze naming/state policy for local fulfillment semantics in this phase.
- Freeze legacy-term handling policy (`shipped`) for local-fulfillment semantics.
- Freeze layer-separation rules for order/fulfillment/readiness/customer/admin semantics.

Non-goals (explicit):
- No runtime implementation.
- No schema/API/UI implementation.
- No runtime symbol rename in code yet.
- No carrier shipping model.
- No dispatch workflow design.
- No redesign of payment truth.
- No redesign of B2/B3 communication truth.

---

## 2) Contract Purpose

This freeze defines allowed naming/state policy for local fulfillment semantics in this phase.

Later runtime implementation must not infer naming loosely.

Order truth, fulfillment mode truth, fulfillment readiness/progression truth, and customer-visible truth must remain explicitly separated where required.

---

## 3) Required Semantic Separation

Frozen semantic layers:
1. Payment truth.
2. Order truth.
3. Fulfillment mode truth (`pickup_local` vs `delivery_local`).
4. Fulfillment readiness/progression truth.
5. Customer-visible communication truth.
6. Operator/admin handling truth.

Alignment policy:
- Layers may be mapped to each other through explicit policy.
- Layers must not collapse into one vague shared label.

Must-not-collapse rules:
- Payment truth must not be used as readiness truth.
- Readiness truth must not be used as completion truth.
- Order lifecycle truth must not be used as a substitute for mode-specific fulfillment progression truth.

---

## 4) Legacy Terminology Resolution (`shipped`)

Frozen policy status for `shipped` in this phase:

1. `shipped` is **forbidden** as future semantic source of truth for local-fulfillment policy.
2. `shipped` is allowed only as **legacy/internal compatibility context** where already present in runtime artifacts.
3. Any future local-fulfillment readiness/progression policy must be defined without relying on `shipped` as the canonical fulfillment meaning.

No partial/vague allowance remains:
- `shipped` is not a valid umbrella term for `pickup_local` + `delivery_local` progression semantics in this phase.

---

## 5) Mode-Aware Naming Policy

Frozen policy:
- Fulfillment naming must remain mode-aware whenever meanings differ by mode.

Minimum distinctions that must remain explicit:
1. Pickup readiness (`ready_for_pickup`) is not local-delivery readiness.
2. Local-delivery readiness (`ready_for_local_delivery`) is not pickup readiness.
3. Pickup completion (`collected`) is not local-delivery completion (`delivered`).
4. One shared misleading label must not represent both mode-specific truths.

This freeze does not require final runtime symbol names yet; it freezes the policy boundary that mode-different meaning requires mode-aware naming.

---

## 6) Relationship Between Order Lifecycle and Fulfillment Progression

Frozen policy direction:
- Use a **primary/secondary separated semantic model**.

Interpretation:
1. Order lifecycle remains the primary order-state track.
2. Fulfillment progression/readiness remains a distinct secondary semantic track.
3. Mapping between tracks must be explicit and policy-bounded.

Forbidden model in this phase:
- One vague combined state track that collapses order lifecycle and fulfillment progression truth.

---

## 7) Customer/Admin Wording Policy Boundaries

Frozen boundaries:
1. Customer-visible wording must not imply carrier behavior that does not exist.
2. Admin/operator wording must not depend on ambiguous generic shipping assumptions.
3. Fulfillment wording must remain compatible with B2/B3 truth discipline.
4. Payment confirmation must not be conflated with readiness.
5. Readiness must not be conflated with completion.

---

## 8) Allowed and Forbidden Naming Patterns

### 8.1 Allowed policy patterns
- “Order confirmed” + separate “ready for pickup” / “ready for local delivery” semantics.
- Distinct pickup completion wording and local-delivery completion wording.
- Legacy/internal `shipped` tolerated only as compatibility residue, not as canonical policy term.

### 8.2 Forbidden policy patterns
- Using `shipped` as catch-all for any local fulfillment progression.
- Using one shared readiness term that is false for one mode.
- Customer wording that implies carrier dispatch model.
- Any naming that collapses payment confirmation, readiness, and completion into one step.
- Any naming that treats pickup and local delivery as semantically identical where they differ.

---

## 9) Deferred Implementation Questions

Deferred (intentionally not frozen here):
1. Exact runtime enum/symbol names.
2. Exact migration/refactor sequencing.
3. Exact event-name implementation details.
4. Exact UI label mapping per channel/surface.
5. Exact compatibility deprecation sequence for legacy terms in runtime artifacts.

---

## 10) Strict Recommendation

Only after this B4.4 freeze, and only after all prerequisite dependent freezes in the active fulfillment line are explicitly closed, open the next bounded fulfillment slice that depends on this naming/state policy.

---

## 11) Acceptance Checklist (Binary PASS/FAIL)

- [x] PASS: Docs-only contract freeze; no runtime/schema/API/UI implementation content.
- [x] PASS: Naming/state policy is frozen as policy, not implementation.
- [x] PASS: Required semantic layers are explicit and non-collapsed.
- [x] PASS: `shipped` policy status is explicit (forbidden as local-fulfillment source of truth; legacy compatibility only).
- [x] PASS: Mode-aware naming policy is explicit for readiness and completion distinctions.
- [x] PASS: Order lifecycle vs fulfillment progression policy direction is explicitly frozen as separated primary/secondary tracks.
- [x] PASS: Customer/admin wording boundaries are explicit and B2/B3-compatible.
- [x] PASS: Allowed vs forbidden naming patterns are concrete and reviewable.
- [x] PASS: Deferred implementation items are explicit and bounded.
- [x] PASS: One strict recommendation is present.
