# EPIC-5 UI/IA Blueprint V1 — Catalogue

- Version: V1
- Frozen on (UTC): 2026-03-05
- Freeze SHA: 865815e38d345769632ed14d8e9e2d7b8a23fc65
- Change policy: V1 is immutable; any change requires V1.1 and synchronized updates across blueprint + acceptance + backend + tests.

## Scope Lock (V1)
This blueprint freezes V1 UI/IA structure and contract assumptions before DB/API/catalogue implementation. Runtime code is intentionally excluded.

## UI Layout Invariants (V1)

### Home (`/`)
- Mandatory order: `header/nav` -> `product grid (primary)` -> `reassurance blocks (trust cues)`.
- Grid is the primary discovery surface and cannot be displaced by secondary messaging.

### Canonical Product List Surface (V1)
- Home (`/`) is the canonical product list surface for V1; there is no separate catalogue/list page in V1.
- Grid layout is the canonical list representation.
- Skeleton loading preserves grid rhythm/slots.
- Empty and error states are explicit and occupy primary list area.

### Product Detail (`/product.html`)
- Carousel is first visual/content section.
- Purchase block includes title, price, variant controls, stock visibility, CTA.
- Specs section is conditional on data presence.
- Error banners are fixed in a visible location above purchase actions.

### Checkout (`/checkout.html`)
- Mandatory sequence: `order summary` -> `customer form` -> `payment section` -> `error/maintenance banner`.
- Error/maintenance banner has fixed placement and cannot be hidden by section transitions.

### Accessibility Invariants (Minimal)
- Explicit labels required for user inputs.
- Focus management must route to first actionable error context after failures.
- Banner regions use `aria-live` where state updates need announcement.

## Contracts are the Source of Truth (V1)

### Endpoint Contract Expectations
- `GET /api/products`
- `GET /api/products/:slug` (detail contract; backend may keep compatibility alias during migration)
- `POST /api/cart/items`

### Frozen Data Primitives

#### Images
`url`, `alt`, `width`, `height`, `position` are required image keys for UI rendering predictability and CLS prevention.

#### Stock State Enum
Only valid values:
- `in_stock`
- `low_stock`
- `out_of_stock`
- `unknown`

#### Pricing Model
- `pricePreview(amount,currency,isFromPrice)` defines display-ready pricing.
- Variant pricing must be represented by either `priceDelta` or `absolutePrice` under explicit rules.

#### Add-to-cart Disable Semantics
`disabledReason` uses a frozen enum baseline:
- `variant_unselected`
- `out_of_stock`
- `dependency_unavailable`

## API Contract Shapes (V1 frozen)

### A) `GET /api/products` (list)
- Success envelope: `{ "data": { "items": [...], "pagination": { "page": 1, "pageSize": 24, "totalItems": 120, "totalPages": 5 } } }`.
- `items[]` contract is list-focused only; required fields: `id`, `slug`, `name`, `images[]`, `pricePreview`, `stock`.
- `pagination` keys are required: `page`, `pageSize`, `totalItems`, `totalPages`.

### B) `GET /api/products/:slug` (detail)
- Success envelope: `{ "data": { ...productDetail } }`.
- Required detail fields: `id`, `slug`, `name`, `images[]`, `variants[]`, `pricePreview` (or equivalent base price source), `stock`; `specs` optional.
- Not found contract: HTTP `404` with `error.code = "product_not_found"`.

### C) `POST /api/cart/items` (add-to-cart)
- Request: `{ "items": [{ "id": "string", "quantity": 1, "variantId": "string|null" }] }`, with `quantity >= 1`.
- Response: `{ "data": { "items": [...], "totals": { "subtotal": 0, "currency": "EUR" } } }`.
- Failure modes: `out_of_stock`, `variant_unselected`, `dependency_unavailable`.

### D) Standard error envelope (frozen)
- Canonical API error shape: `{ "error": { "code": "string", "message": "string", "reasonCode": "string?", "requestId": "string?" } }`.
- Status mapping: `400` validation, `403` forbidden, `404` not found, `503` dependency unavailable, `503` maintenance/payments disabled.

## ErrorBanner Standardization (V1)

| code | title (canonical) | message (canonical) | retryable |
|---|---|---|---|
| `payments_disabled` | `Paiements indisponibles` | `Paiements indisponibles (maintenance)` | `false` |
| `dependency_unavailable` | `Service temporairement indisponible` | `Une dépendance critique est indisponible. Réessayez.` | `true` |

Rules:
- one code maps to one canonical title/message and one `retryable` boolean.
- identical mapping is required across checkout, PDP, and add-to-cart surfaces.
- raw `reasonCode` values are not user-facing in V1.

## Required UI Test Hooks (V1 frozen)
- `data-testid="product-grid"`
- `data-testid="product-card"`
- `data-testid="pdp-carousel"`
- `data-testid="variant-picker"`
- `data-testid="add-to-cart"`
- `data-testid="error-banner"` with `data-code="<error_code>"`
- `data-testid="checkout-submit"`

## Variant + Stock Rules (V1 frozen)
- variants present + no selection => CTA disabled, `disabledReason="variant_unselected"`.
- selected variant stock overrides product stock.
- `unknown` stock => CTA disabled, `disabledReason="dependency_unavailable"`.
- `out_of_stock` => CTA disabled, `disabledReason="out_of_stock"`.
- same rules apply on PDP and add-to-cart surfaces.

## Anti-butterfly Stop Conditions
Changes to frozen primitives below are blocked unless updated together in blueprint + acceptance + backend contracts + tests:
1. API envelope shapes and error codes/reasonCode behavior.
2. Pricing semantics.
3. Stock enum values.
4. `disabledReason` enum.
5. Required UI test hooks.

No partial contract edits are allowed.