# EPIC-6.B4.1 — Local Fulfillment Mode Contract Freeze (Mayotte)

- Type: Contract freeze (docs-only)
- Status: Frozen for B4.1
- Date (UTC): 2026-04-09
- Canonical scope alignment reference: `main@346ffe36272753e0a9e8f0eec16e9c046ed6d54a` (branch/SHA mismatch is warning-only unless lineage is inconsistent)

---

## 1) Scope and Non-Goals

This slice is a **docs-only contract freeze** for local fulfillment mode semantics in the current Mayotte phase.

In scope:
- Freezing fulfillment mode meanings and boundaries.
- Freezing product-level eligibility contract.
- Freezing cart-level eligibility contract (including mixed-cart policy).
- Freezing admin/customer contract boundaries.
- Freezing anti-ambiguity constraints with B2/B3 truth discipline.

Non-goals (explicit):
- No runtime implementation.
- No schema migration.
- No schema/API payload design.
- No route/controller changes.
- No UI implementation.
- No classic carrier shipping model.
- No pricing implementation yet.
- No route optimization / dispatch platform.
- No broad logistics architecture.

---

## 2) Contract Purpose

This freeze defines the exact fulfillment-mode contract for this phase only.

Implementation after this checkpoint must not infer fulfillment truth loosely.

Product eligibility, cart eligibility, and customer choice must be deterministic, auditable, and non-misleading.

---

## 3) Fulfillment Modes Frozen for This Phase

Frozen conceptual modes:
1. `pickup_local`
2. `delivery_local`

Explicitly rejected in this phase:
- generic `shipping`
- generic `carrier`
- hidden fallback abstractions that blur local operational truth

Interpretation rule:
- If a behavior cannot be represented truthfully by `pickup_local` or `delivery_local`, it is out of scope for this phase.

---

## 4) Product-Level Eligibility Contract

### 4.1 `delivery_local` (strict per-product contract)
- `delivery_local` is allowed only when explicitly enabled by admin on the product.
- Absence of explicit delivery eligibility means **not deliverable**.
- Delivery eligibility must not be inferred from global catalog settings.
- Delivery eligibility must not be inferred from payment, address presence, or customer preference.

### 4.2 `pickup_local` (frozen policy for this phase)
- `pickup_local` is frozen as a **global default-available policy** for this phase.
- This default remains bounded by later operational/business constraints, but no per-product pickup gate is introduced in this contract.

### 4.3 Anti-ambiguity rule
- Product eligibility truth for `delivery_local` is explicit-per-product only.
- No implicit inheritance or fallback interpretation is allowed.

---

## 5) Cart-Level Eligibility Contract (Mixed-Cart Freeze)

### 5.1 Frozen rule
`delivery_local` is cart-eligible **only if all line items in the cart are delivery-eligible**.

Equivalent rule:
- Any non-delivery-eligible line item makes the full cart non-eligible for `delivery_local`.

### 5.2 Forbidden shortcuts
- One delivery-eligible item must never make an incompatible cart deliverable.
- Partial cart eligibility must never be represented as whole-cart delivery eligibility.

### 5.3 Mixed/incompatible cart behavior (conceptual)
When cart contains mixed delivery eligibility:
- `delivery_local` must be blocked as a selectable mode for that cart.
- Customer may proceed only with modes that are truthfully cart-eligible (typically `pickup_local` under current phase policy).

### 5.4 Split-order boundary
- Implicit order splitting is explicitly out of scope for this phase.
- Any future split-order design requires a separate explicit freeze before implementation.

---

## 6) Admin Control Contract

Admin control required for this phase:
- Per-product `delivery_local` eligibility control.
- Effective read model showing fulfillment eligibility result per product.

Out of scope for this contract phase:
- Bulk fulfillment-edit tooling.
- Delivery operations tooling.
- Fleet/driver management tooling.
- Dispatch optimization tooling.
- Complex logistics orchestration features.

---

## 7) Customer Selection Contract

Customer may select later only from truthfully eligible modes:
1. Pickup only.
2. Delivery only.
3. Pickup vs delivery choice only when both are truly eligible.

Must-never-happen rules:
- No false choice presentation.
- No `delivery_local` selection when product/cart is not delivery-eligible.
- No selection semantics that outrun eligibility truth.
- No post-selection silent coercion to a different mode without explicit policy and clear customer semantics.

---

## 8) Fulfillment Truth vs Order/Customer Truth Contract

Frozen relationships:
1. Fulfillment eligibility does not imply order confirmation.
2. Fulfillment mode selected does not imply payment success.
3. Ready semantics must be mode-specific and truthful.
4. Cancellation remains separate from fulfillment readiness semantics.

Required semantic separations:
- `payment_recognized` != `confirmed`
- `confirmed` != `ready_for_pickup`
- `confirmed` != `ready_for_local_delivery`
- `ready_for_pickup` != `ready_for_local_delivery`

B2/B3 consistency requirement:
- External/customer-visible semantics must not overstate certainty relative to internal truth classifications.

---

## 9) Explicit Exclusions

Out of scope for this phase:
- Carrier shipping.
- Shipping tariff/rate engine.
- Route optimization.
- Driver assignment platform.
- Multi-warehouse / multi-origin fulfillment.
- Implicit order splitting for mixed carts.
- Broad dispatch scheduling platform.

---

## 10) Deferred Questions for Later Fulfillment Stories

Deferred to later explicit freezes:
1. Exact customer data contract for `pickup_local`.
2. Exact customer data contract for `delivery_local`.
3. Exact readiness-state names and transition policy.
4. Exact cancellation interaction with selected fulfillment mode.
5. Whether pickup later becomes per-product configurable.
6. Whether/how delivery-fee policy is introduced in a later bounded phase.

---

## 11) Strict Recommendation

Do not implement local fulfillment until fulfillment modes, product-level delivery eligibility, cart-level delivery eligibility, and customer selection behavior are explicitly aligned to this contract.

---

## 12) Acceptance Checklist (Binary PASS/FAIL)

- [x] PASS: Docs-only contract freeze; no runtime/schema/API/UI implementation content.
- [x] PASS: Fulfillment modes are frozen as `pickup_local` and `delivery_local` only.
- [x] PASS: Generic `shipping`/`carrier` semantics are explicitly rejected.
- [x] PASS: Product-level `delivery_local` eligibility is explicit admin-controlled per-product only.
- [x] PASS: Cart-level mixed-eligibility contract is explicit (`all items eligible` rule).
- [x] PASS: No implicit split-order behavior is allowed in this phase.
- [x] PASS: Customer selection contract blocks false/ineligible choices.
- [x] PASS: Fulfillment truth vs order/customer truth separation is explicit and B2/B3-aligned.
- [x] PASS: Deferred items remain bounded for later freezes.
- [x] PASS: One strict recommendation is present.
