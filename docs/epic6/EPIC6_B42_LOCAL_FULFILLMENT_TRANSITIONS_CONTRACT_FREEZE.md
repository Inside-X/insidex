# EPIC-6.B4.2 — Local Fulfillment Transitions Contract Freeze (Mayotte)

- Type: Contract freeze (docs-only)
- Status: Frozen for B4.2
- Date (UTC): 2026-04-09
- Canonical scope alignment reference: `main@de9ff7390b5610fe67a3e0647b6006da93f8f80f` (branch/SHA mismatch is warning-only unless lineage is inconsistent)

---

## 1) Scope and Non-Goals

This slice is a **docs-only contract freeze** for local fulfillment transition semantics in the current Mayotte phase.

In scope:
- Freeze allowed/forbidden fulfillment transitions before and at order creation.
- Freeze invalidation and reselection boundaries for `pickup_local` / `delivery_local`.
- Freeze order-creation lock boundary and post-order mutation boundary.
- Preserve B2/B3 truth-discipline compatibility.

Non-goals (explicit):
- No runtime implementation.
- No schema migration.
- No schema/API payload design.
- No route/controller changes.
- No UI implementation.
- No classic carrier shipping.
- No split-order design.
- No dispatch workflow.
- No address model design.
- No pricing implementation yet.
- No broad logistics architecture.

---

## 2) Contract Purpose

This freeze defines allowed and forbidden fulfillment transitions for this phase.

Later implementation must not infer transition truth loosely.

Cart eligibility, selection validity, invalidation behavior, reselection behavior, and lock-in semantics must remain deterministic.

---

## 3) Transition Boundary for This Slice

For this slice, “transition” is limited to these conceptual boundaries:
1. Cart evaluation state.
2. Customer selection state before order creation.
3. Re-evaluation after cart-content changes.
4. Re-evaluation after admin/product eligibility changes before order creation.
5. Order-creation lock boundary.
6. Post-order mutation boundary.

Out of boundary for this slice:
- dispatch execution transitions,
- driver/route operations transitions,
- post-order exception workflow redesign.

---

## 4) Pre-Order Availability and Validity Contract

### 4.1 When `delivery_local` is available
`delivery_local` is available only when **current cart-wide truth** satisfies both frozen B4.1 rules:
1. Each cart line item is on a product with explicit admin-enabled `delivery_local` eligibility.
2. The cart satisfies the B4.1 all-items-eligible rule (no non-eligible line item).

### 4.2 When `delivery_local` is unavailable
`delivery_local` is unavailable when any cart line item does not satisfy product-level explicit `delivery_local` eligibility.

### 4.3 No hidden disqualifier rule
No additional implicit/hidden delivery disqualifier may be introduced in this phase.
Any new delivery disqualifier requires a separate explicit later policy freeze.

### 4.4 Previously selected but now invalid
If `delivery_local` was selected earlier but becomes invalid before order creation:
- the selection is invalidated,
- it must not be treated as still valid,
- `pickup_local` remains a truthful selectable mode for this phase,
- but `pickup_local` must not be auto-selected,
- explicit reselection is required before order creation.

### 4.5 Anti-stale rule
Eligibility must always derive from **current validated cart-wide truth**, not stale selection memory.

---

## 5) Cart-Change Transition Rules

### 5.1 Recalculation requirement
Any cart-content change must trigger fulfillment-availability recalculation conceptually.

### 5.2 Eligible cart -> add ineligible item
If an ineligible item is added to a previously delivery-eligible cart:
- `delivery_local` becomes unavailable,
- prior `delivery_local` selection is invalidated,
- `pickup_local` remains selectable truth for this phase,
- no silent downgrade or auto-selection to `pickup_local` is allowed.

### 5.3 Eligible cart -> line change makes item ineligible
If quantity/variant/line change makes any item delivery-ineligible:
- same invalidation behavior as 5.2 applies.

### 5.4 Mixed/ineligible cart -> blocking item removed
If blocking item is removed and cart becomes fully delivery-eligible:
- `delivery_local` may become selectable again,
- prior invalidated delivery selection is **not auto-restored**,
- explicit customer reselection is required.

### 5.5 Mixed/ineligible -> fully eligible again
Same rule as 5.4:
- eligibility may re-open,
- selection does not auto-return,
- no hidden or inferred re-selection.

---

## 6) Admin/Product Eligibility Drift Before Order Creation

If admin/product eligibility changes before order creation and invalidates delivery:
- current validation truth overrides prior assumptions,
- stale pre-order assumptions must not pass validation,
- no silent `delivery_local` -> `pickup_local` conversion is allowed,
- explicit invalidation + explicit reselection is required.

Contract consequence:
- pre-order eligibility is always “validate at decision time,” not “trust historical client state.”

---

## 7) Customer Selection Contract During Transitions

Customer may select only truthfully valid modes at the moment of selection/confirmation:
1. `pickup_local` only when that is the only truthful mode.
2. `delivery_local` only when cart-wide delivery eligibility is currently true.
3. Both only when both are truly available.

Must-never-happen rules:
- No false choice.
- No preserved invalid choice presented as valid.
- No silent rewrite of previously chosen mode.
- No selection semantics that outrun current eligibility truth.

Fail-closed selection rule:
- After invalidation, order creation remains blocked until the customer explicitly reselects a currently valid mode.

---

## 8) Order Creation Lock Boundary

Frozen rule:
- Fulfillment mode is locked from **current validated truth** at order creation.

Required implications:
1. Order creation must not rely on stale client-side assumptions.
2. Locked fulfillment mode is not a soft hint for this phase.
3. A mode invalid at validation time cannot be silently substituted by another mode.
4. If a previously selected mode was invalidated pre-order, order creation must not proceed until explicit reselection of a currently valid mode.

---

## 9) Post-Order Mutation Policy (This Phase)

Frozen policy:
- No implicit system rewrite after order creation.
- No ad hoc operator rewrite after order creation.
- No silent customer-side conversion after order creation.

Future exceptions:
- If future exceptions are ever needed, they require a separate explicit later freeze and are not part of this slice.

---

## 10) Fulfillment Truth vs Order/Customer Truth

Frozen relationships:
1. Fulfillment eligibility does not imply order confirmation.
2. Selected fulfillment mode does not redefine payment truth.
3. Selected fulfillment mode does not redefine B2/B3 customer-communication truth.
4. Post-order fulfillment handling must stay aligned with existing business-truth boundaries.

Required semantic separation:
- `payment_recognized` != `confirmed` != `ready_for_pickup` != `ready_for_local_delivery`

---

## 11) Explicit Exclusions

Out of scope for this phase:
- Carrier shipping.
- Shipping tariff engine.
- Route optimization.
- Driver assignment platform.
- Split-order logic.
- Post-order exception handling redesign.
- Delivery fee policy.
- Customer messaging implementation.
- Operational dispatch tooling.

---

## 12) Deferred Questions for Later Fulfillment Stories

Deferred to later explicit freezes:
1. Exact customer data requirements for pickup vs delivery.
2. Exact readiness-state names and transitions by fulfillment mode.
3. Any future exception policy for post-order fulfillment changes.
4. Any delivery-fee policy if later introduced.
5. Any later operational dispatch/routing design if ever introduced.

---

## 13) Strict Recommendation

Do not implement local fulfillment runtime transitions until pre-order invalidation, explicit reselection behavior, order-creation lock, and post-order immutability are explicitly aligned to this contract.

---

## 14) Acceptance Checklist (Binary PASS/FAIL)

- [x] PASS: Docs-only contract freeze; no runtime/schema/API/UI implementation content.
- [x] PASS: Transition boundary is explicit and phase-bounded.
- [x] PASS: Pre-order availability is tied only to frozen B4.1 product/cart eligibility truth.
- [x] PASS: No hidden/implicit delivery disqualifier is allowed in this phase.
- [x] PASS: Cart-change transition behavior is explicit, deterministic, and recalculation-based.
- [x] PASS: Silent fallback from `delivery_local` to `pickup_local` is explicitly forbidden.
- [x] PASS: Invalidation requires explicit reselection; order creation is blocked until reselection occurs.
- [x] PASS: Order-creation lock boundary is explicit and non-soft.
- [x] PASS: Post-order fulfillment-mode mutation is explicitly forbidden for this phase.
- [x] PASS: Fulfillment truth remains aligned with B2/B3 communication/state discipline.
- [x] PASS: Explicit exclusions and deferred questions are bounded.
- [x] PASS: One strict recommendation is present.

---

## 15) Fail-Closed Examples

1. **Fully eligible cart -> `delivery_local` selectable**
   - Cart remains fully delivery-eligible.
   - `delivery_local` is available for explicit selection.

2. **Eligible cart -> add one ineligible item**
   - `delivery_local` becomes invalid.
   - Prior delivery selection is invalidated.
   - `pickup_local` may be shown as selectable truth, but is not auto-selected.

3. **Mixed/ineligible cart -> remove blocking item**
   - `delivery_local` may become selectable again.
   - It is not assumed selected automatically.
   - Explicit reselection is required.

4. **Order created with validated mode -> later admin drift**
   - Post-order mode does not silently mutate.
   - Later admin eligibility drift does not rewrite the order’s locked mode in this phase.
