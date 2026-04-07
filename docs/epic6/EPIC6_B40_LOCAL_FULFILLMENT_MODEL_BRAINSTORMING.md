# EPIC-6.B4.0 — Local Fulfillment Model Brainstorming (Mayotte)

- Type: Business clarification checkpoint (docs-only)
- Status: Drafted for B4.0
- Date (UTC): 2026-04-07
- Canonical scope alignment checkpoint: `main@b99c2f4c16c93c1b5781a77386e9ac28c81a2514`

---

## 1) Scope and Non-Goals

This slice is a **docs-only clarification / brainstorming checkpoint** to freeze local-fulfillment meaning before implementation.

In scope:
- Clarifying fulfillment modes for this phase in Mayotte.
- Clarifying product-level eligibility semantics.
- Clarifying admin control boundary and customer selection boundary.
- Clarifying alignment rules with B2/B3 truth discipline.
- Clarifying implementation questions that must be frozen later.

Non-goals (explicit):
- No runtime implementation.
- No schema migration.
- No schema/API payload design.
- No route/controller changes.
- No admin/customer UI implementation.
- No classic carrier shipping model.
- No delivery pricing implementation yet.
- No logistics engine / route optimization.
- No driver assignment tooling.
- No broad fulfillment platform design.

---

## 2) Why This Clarification Is Required

This clarification is required because “shipping” is not the correct model for this phase.

For Mayotte local commerce, fulfillment must be modeled explicitly as local operational modes, not as generic carrier dispatch semantics.

Without a frozen model now, implementation risk is high:
- product-level eligibility can drift into implicit/global assumptions,
- customer choice can overstate what is actually fulfillable,
- local pickup, local delivery, and generic shipping semantics can be conflated.

This checkpoint prevents that drift before any runtime work.

---

## 3) Candidate Fulfillment Modes (Concept Only)

### 3.1 Mode A — Local Pickup (`pickup_local` / retrait local)
Customer retrieves order from a designated local pickup point operated by InsideX.

### 3.2 Mode B — Local Delivery (`delivery_local`)
InsideX performs local delivery within Mayotte operational boundaries.

### 3.3 Product Exclusion Principle
A product may be eligible for one mode and ineligible for another. Eligibility is not assumed uniform across the catalog.

### 3.4 Scope Position for This Phase
Likely in scope now:
- Local pickup.
- Local delivery.

Out of scope now:
- Carrier shipping mode (national/international parcel model).
- Any additional fulfillment mode requiring independent logistics orchestration.

Explicit rejection (for this phase):
- Generic `shipping`/`carrier` mode as a fallback abstraction.
- Any mode label that hides local operational truth.

---

## 4) Product-Level Eligibility Model

This is the critical rule set for anti-ambiguity.

### 4.1 Local Delivery Rule (Mandatory)
- Local delivery is **not** globally assumed.
- Local delivery must be explicitly enabled/disabled **per product** by admin control.
- If not explicitly enabled for a product, local delivery must be treated as unavailable for that product.

### 4.2 Pickup Rule (Preferred Interpretation for Later Freeze)
Preferred policy to carry forward:
- Pickup is globally available by business default for this phase,
- with optional later tightening if operational constraints require per-product pickup controls.

Rationale:
- This keeps initial policy simpler while preserving strict mandatory per-product gating for local delivery (the higher-risk mode).
- This avoids delaying B4 implementation on unnecessary per-product pickup complexity unless justified.

### 4.3 What Must Be Configurable at Product Level
Must be configurable at product level:
- Local delivery eligibility (explicit opt-in/opt-out per product).

May remain global policy (for now):
- Pickup availability default policy.

Must not remain ambiguous:
- Whether local delivery can be offered when product-level eligibility is absent (answer: no).
- Whether checkout can infer delivery eligibility from any global catalog flag (answer: no).

---

## 5) Admin Control Boundary (Concept/Policy)

Admin must conceptually control, for this phase:
- Whether a given product allows local delivery (per-product decision).

Admin policy for pickup in this phase:
- Pickup follows global default policy unless a later freeze explicitly introduces per-product pickup control.

What must be visible/editable later in product administration:
- A clear product-level control for local delivery eligibility.
- A clear read model indicating effective fulfillment eligibility per product.

Out of scope now:
- Form layout details.
- UX copy details.
- Bulk-operation tooling.
- Delivery-capacity management tooling.

---

## 6) Customer-Facing Selection Boundary (Concept/Policy)

Customer may conceptually be allowed to choose only among actually eligible modes:

1. Pickup only (when delivery is not eligible for product/order context).
2. Delivery only (when pickup is policy-disabled in context, if ever introduced).
3. Pickup vs delivery choice (only when both are eligible).

Must-never-happen behaviors:
- Showing local delivery as selectable when the product is not delivery-eligible.
- Showing pickup vs delivery as a fake choice when only one mode is fulfillable.
- Allowing customer selection to override product/admin eligibility truth.
- Confirming an order with a mode that was not eligible at selection time.

---

## 7) Fulfillment Truth vs Order Truth (B2/B3 Alignment)

Fulfillment truth and order/payment truth must remain distinct and non-contradictory.

Rules:
1. Fulfillment mode availability constrains what may be selected; it does not by itself confirm an order.
2. Order confirmation semantics remain governed by established truth discipline (no overstatement, no contradiction).
3. “Ready” semantics must be mode-specific and truthful:
   - `ready_for_pickup` means pickup readiness exists.
   - `ready_for_local_delivery` means local-delivery readiness exists.
4. Cancellation semantics remain independent from fulfillment-mode aspiration.
5. Customer-visible status must never claim readiness/finality inconsistent with actual fulfillment mode and B2/B3 boundaries.

Anti-collapse rule:
- Payment recognized ≠ confirmed ≠ ready-for-pickup ≠ ready-for-local-delivery.

---

## 8) Explicit Exclusions

Not part of this phase:
- Carrier shipping.
- Shipping zones/tariff engine.
- Route optimization.
- Multi-warehouse logistics.
- Delivery scheduling platform.
- Complex dispatch operations.
- Driver fleet/assignment management.
- Dynamic shipping-rate computation.

---

## 9) Questions to Freeze in Later Stories

The following questions must be explicitly frozen before implementation stories proceed:

1. Pickup policy: remain global default, or become per-product configurable?
2. Local delivery policy: confirm mandatory per-product opt-in as final frozen rule.
3. Minimum customer data for local delivery: exact address/contact fields and validation boundary.
4. Minimum customer data for pickup: exact contact/identity fields and notification boundary.
5. Readiness semantics: exact separation of `ready_for_pickup` vs `ready_for_local_delivery` and allowed transitions.
6. Mixed cart policy: if cart contains products with incompatible eligibility, what deterministic rule applies?
7. Cancellation boundary interaction: how fulfillment-mode commitments are revoked/represented on cancellation.
8. Future pricing policy: whether local delivery fee policy exists later and how it remains isolated from this phase.

---

## 10) Strict Recommendation

Do not implement local fulfillment until fulfillment modes, per-product admin eligibility (including mandatory per-product local-delivery control), and customer selection semantics are explicitly frozen from this brainstorming checkpoint.

---

## 11) Acceptance Checklist (Binary PASS/FAIL)

- [x] PASS: Docs-only clarification checkpoint; no runtime/schema/API/UI implementation content.
- [x] PASS: Local modes are explicit (`pickup_local`, `delivery_local`) and generic carrier shipping is excluded.
- [x] PASS: Local delivery per-product admin eligibility is explicit and non-optional.
- [x] PASS: Pickup policy preference is explicit for later freeze (global default unless changed by explicit later decision).
- [x] PASS: Customer selection boundary forbids misleading/unavailable choices.
- [x] PASS: Fulfillment truth vs order truth separation is explicit and aligned to B2/B3 anti-contradiction discipline.
- [x] PASS: Out-of-scope logistics/platform concerns are explicitly excluded.
- [x] PASS: Later freeze questions are explicit and implementation-neutral.
- [x] PASS: One strict recommendation is present.
