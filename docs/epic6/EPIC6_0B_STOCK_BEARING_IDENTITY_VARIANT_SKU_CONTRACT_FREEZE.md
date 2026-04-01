# EPIC-6.0B — Stock-Bearing Identity / Variant-SKU Contract Clarification

- Type: Contract freeze (docs-only)
- Status: Frozen for EPIC-6.0B
- Date (UTC): 2026-04-01
- Canonical checkpoint reference: `main@a59103cf5cf4d53bd38d2ab06053156df473d55b`

## 1) Scope and Non-Goals

This slice freezes only the minimum identity contract used to evaluate stock truth.

In scope:
- Minimum stock-bearing identity rule
- Product / variant / SKU relationship at contract level
- Fail-closed posture for identity ambiguity
- Explicit implementation deferrals

Non-goals (explicit):
- Runtime decrement mechanics
- Stock reservation/hold behavior
- Warehouse/location logic
- Shipping logic
- Admin stock UI
- SKU-generation workflow design (unless later slices require it)
- API payload design
- DB schema/migration design

## 2) Stock-Bearing Identity Baseline

- Stock must attach to exactly one unambiguous sellable identity per requested line item.
- Stock evaluation must not execute against mixed identity inputs (for example, product + conflicting variant/SKU references).
- Client-facing labels, display names, or presentation text are non-authoritative for stock truth.
- Stock truth is evaluated only against server-resolved identity.

## 3) Product / Variant / SKU Clarification

Contract roles:
- **Product identity**: parent catalog identity.
- **Variant identity**: child sellable identity under a product when variantized sales are present.
- **SKU identity**: canonical business identifier for a sellable variant when SKU is present.

Interpretation rules:
- If only product-level sellable identity exists for an item, product identity is the stock-bearing identity.
- If variant identity exists for an item, variant identity is the stock-bearing identity.
- If SKU exists and maps to a variant, SKU is a resolver for that variant identity, not a second independent stock target.
- Product-level and variant-level identity must not both be treated as independent stock-bearing targets for the same sellable unit.

This slice does not mandate a new catalog architecture; it freezes identity resolution behavior only.

## 4) Fail-Closed Identity Posture

Finalization must be blocked when any of the following occurs:
- Stock-bearing identity unresolved.
- Product/variant relationship mismatch.
- SKU identity ambiguous, missing mapping, or conflicting with variant/product identity.
- Sellable target cannot be deterministically mapped to one stock-bearing entity.

No warning-only or best-effort fallback is allowed for identity ambiguity.

## 5) Relationship to EPIC-6.0A

- EPIC-6.0A froze stock ownership, decrement posture, and no-oversell contract.
- EPIC-6.0B freezes the identity target to which those 6.0A guarantees are applied.
- EPIC-6.0B does not redefine or weaken EPIC-6.0A guarantees.

## 6) Relationship to Adjacent Areas

Boundary with catalogue/media/product modeling:
- Catalogue defines product/variant/SKU data shape and presentation.
- This slice defines only the stock-bearing identity contract used by inventory decisions.

Boundary with checkout/order line identity:
- Checkout/order flows must provide identity that server can deterministically map to one stock-bearing entity.
- This slice does not redesign checkout payloads.

Boundary with runtime mechanics:
- Locking, transaction strategy, and decrement execution remain deferred.

Boundary with logistics/shipping:
- No carrier, fulfillment, or shipping pricing behavior is defined here.

## 7) Explicit Deferrals

Deferred to later slices:
- Runtime decrement mechanics
- Reservation behavior
- Locking / transaction strategy
- Inventory persistence schema
- Admin stock operations
- Fulfillment logic

## 8) Acceptance Checklist (PASS/FAIL)

- [ ] PASS/FAIL: Document remains docs-only and implementation-neutral.
- [ ] PASS/FAIL: Single unambiguous stock-bearing identity rule is explicit.
- [ ] PASS/FAIL: Product/variant/SKU contract relationship is explicit and non-conflicting.
- [ ] PASS/FAIL: Identity ambiguity cases are fail-closed.
- [ ] PASS/FAIL: EPIC-6.0A relationship is explicit and non-overriding.
- [ ] PASS/FAIL: Runtime/schema/API/UI/logistics scope expansion is excluded.
