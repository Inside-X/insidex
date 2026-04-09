# EPIC-6.B4.5 — Fulfillment Mode-Specific Customer Data Contract Freeze

- Type: Contract freeze (docs-only)
- Status: Frozen for B4.5
- Date (UTC): 2026-04-09
- Canonical scope alignment reference: `main@909a79abe2fe2bfb0cf9bbd8d6a484754c2f3cb7` (branch/SHA mismatch is warning-only unless lineage is inconsistent)

---

## 1) Scope and Non-Goals

This slice is a **docs-only contract freeze** for minimum fulfillment-related customer data policy.

In scope:
- Freeze minimum mode-specific customer-data policy for `pickup_local` and `delivery_local`.
- Freeze required/optional/forbidden conceptual data boundaries per mode.
- Freeze order-creation snapshot policy for fulfillment-relevant customer data.

Non-goals (explicit):
- No runtime implementation.
- No schema/API/UI implementation.
- No pricing/fee policy.
- No dispatch workflow design.
- No carrier shipping address model.
- No broad CRM/profile redesign.

---

## 2) Contract Purpose

This freeze defines minimum truthful customer-data requirements for each fulfillment mode.

Later implementation must not infer fulfillment truth from vague or partial input.

Data requirements must remain mode-aware, proportionate, and non-carrier.

---

## 3) Core Data-Policy Principles

1. Collect only data required for truthful execution of selected fulfillment mode.
2. Do not require delivery-only data for `pickup_local`.
3. Do not allow `delivery_local` without sufficient delivery-target and contact truth.
4. No fake carrier/shipping abstractions.
5. No weak inference from incomplete data.
6. Order-creation snapshot must come from current validated truth, not stale client memory.

---

## 4) Mode-Specific Minimum Data Requirements

The following is a contract-level minimum; exact field names are deferred.

### 4.1 `pickup_local`

**Required**
- Customer/contact identity sufficient for handoff identity check or pickup reference linkage.
- Contactability channel sufficient for pickup coordination (at least one reliable channel).

**Optional**
- Additional coordination hints (e.g., preferred pickup note) that do not redefine required truth.

**Forbidden / Not applicable as requirement**
- Delivery-target destination details as mandatory prerequisites.
- Carrier-like shipping-specific constructs.

### 4.2 `delivery_local`

**Required**
- Customer/contact identity sufficient for delivery handoff.
- Contactability sufficient for delivery coordination.
- Delivery-target destination truth sufficient to identify where local handoff/delivery must occur.

**Optional**
- Additional delivery guidance details that improve coordination but do not replace required destination truth.

**Forbidden / Not applicable as sufficient alone**
- Pickup-only handoff data used as substitute for destination truth.
- Vague destination intent without actionable target truth.

### 4.3 Cross-mode strictness rule
- `delivery_local` requires additional destination/handoff truth beyond `pickup_local`.
- Data sufficient for one mode must not be assumed sufficient for the other when meaning differs.

---

## 5) Delivery-Local Destination Truth Boundary

For `delivery_local`, minimum destination truth must identify an actionable local delivery target conceptually.

Frozen boundary:
1. Destination truth cannot be vague or partial intent only.
2. Destination truth must be sufficient for non-ambiguous local delivery coordination.
3. Exact implementation field names remain deferred.
4. This slice does not design a carrier-grade address schema.

---

## 6) Pickup-Local Handoff Truth Boundary

For `pickup_local`, minimum truth must support pickup readiness coordination and handoff identity confidence.

Frozen boundary:
1. Pickup requires contact/handoff truth, not delivery-target truth.
2. Delivery-only destination requirements must not be imposed as mandatory pickup prerequisites.
3. Optional pickup-supporting notes may exist but must not become hidden mandatory fields.

---

## 7) Order Snapshot Policy

At order creation, snapshot truth must include:
1. Selected fulfillment mode (`pickup_local` or `delivery_local`).
2. Validated fulfillment-relevant customer data for that selected mode.
3. Evidence that snapshot was taken from current validated state (not stale client-side assumptions).

Boundary:
- Post-order ad hoc mutation remains out of policy in this phase unless later explicitly frozen.

---

## 8) Invalid / Inconsistent Combinations

Future implementation must reject at minimum:
1. `delivery_local` selected without sufficient delivery-target truth.
2. Pickup order requiring delivery-only semantics as if mandatory.
3. Stale or mode-incompatible fulfillment data presented as valid at order creation.
4. Conflicting mode/data combinations that create false fulfillment truth.

---

## 9) Relationship to Customer/Admin Wording and B2/B3 Truth

Frozen boundary:
1. Fulfillment-data sufficiency does not imply payment confirmation.
2. Fulfillment-data sufficiency does not imply readiness.
3. Customer/admin wording must not overstate what captured data proves.
4. This slice remains compatible with B2/B3 communication truth discipline.

---

## 10) Allowed and Forbidden Data-Policy Patterns

### 10.1 Allowed patterns
- `pickup_local`: requires handoff/contact truth; does not require delivery destination truth.
- `delivery_local`: requires handoff/contact truth + delivery-target truth.
- Order creation proceeds only with mode-compatible validated data snapshot.

### 10.2 Forbidden patterns
- Accepting `delivery_local` with incomplete destination truth.
- Requiring delivery-only destination data as mandatory for `pickup_local`.
- Treating partial destination intent as sufficient truth.
- Reusing stale client-side fulfillment data at order creation without current validation.

---

## 11) Deferred Implementation Questions

Deferred intentionally:
1. Exact API payload field names.
2. Exact database schema shape.
3. Exact UI form composition.
4. Exact validation-library implementation details.
5. Exact post-order exception policy if ever opened later.

---

## 12) Strict Recommendation

Only after this B4.5 freeze, and only after all prerequisite dependent freezes in the active fulfillment line are explicitly closed, open the next bounded fulfillment slice that depends on this data contract.

---

## 13) Acceptance Checklist (Binary PASS/FAIL)

- [x] PASS: Docs-only contract freeze; no runtime/schema/API/UI implementation content.
- [x] PASS: Mode-specific minimum data policy is explicit for `pickup_local` and `delivery_local`.
- [x] PASS: Required vs optional vs forbidden/not-applicable boundaries are explicit.
- [x] PASS: Delivery destination truth boundary is explicit and non-carrier.
- [x] PASS: Pickup handoff truth boundary avoids delivery-only mandatory requirements.
- [x] PASS: Order snapshot policy is explicit and anti-stale.
- [x] PASS: Invalid/inconsistent mode/data combinations are explicit for rejection.
- [x] PASS: B2/B3 compatibility boundary is explicit and non-weakened.
- [x] PASS: Allowed/forbidden data-policy patterns are concrete and reviewable.
- [x] PASS: Deferred implementation items are bounded.
- [x] PASS: One strict recommendation is present.
