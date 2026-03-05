# EPIC-5 UI Acceptance Checklist V1

- Version: V1
- Frozen on (UTC): 2026-03-05
- Freeze SHA: 865815e38d345769632ed14d8e9e2d7b8a23fc65
- Change policy: V1 is immutable; any change requires V1.1 and synchronized updates across blueprint + acceptance + backend + tests.

## Purpose
This document freezes V1 UI acceptance criteria before EPIC-5 implementation. It is the approval gate for UI behavior and contract alignment and must be treated as immutable unless all linked artifacts are updated together.

## UI Layout Invariants (V1)

### Home (`/`)
1. Rendering order is strict: `header/nav` -> `product grid (primary)` -> `reassurance blocks (trust cues)`.
2. No reassurances may render above the primary product grid.
3. Any fallback/error content must preserve the same top-level order.

### Canonical Product List Surface (V1)
1. Home (`/`) is the canonical product list surface for V1; there is no separate catalogue/list page in V1.
2. Product list uses a grid layout as the primary presentation.
3. Loading state must display skeleton placeholders in the same grid footprint.
4. Empty state must be explicit, non-crashing, and visible in the primary content area.
5. Error state must be explicit, non-crashing, and visible in the primary content area.

### Product Detail Page (`/product.html`)
1. Carousel renders first in content flow.
2. Purchase block is mandatory and contains: title, price, variants, stock state, CTA.
3. Specs section renders only when specs data exists.
4. Error banners appear in a fixed, visible area above purchase interactions.

### Checkout (`/checkout.html`)
1. Rendering order is strict: `order summary` -> `customer form` -> `payment section` -> `error/maintenance banner`.
2. Error/maintenance banner placement is fixed and always visible when active.
3. Banner placement cannot be moved by page state transitions.

### Accessibility Invariants (Minimal)
1. Interactive form controls require explicit labels.
2. Focus is moved to the first actionable error context after validation/submit failures.
3. Status/error banners use `aria-live` where applicable so updates are announced.

## Contracts are the Source of Truth (V1)

### Expected Endpoints (frozen)
- `GET /api/products` (list)
- `GET /api/products/:slug` (detail contract; backend may keep compatibility alias during migration)
- `POST /api/cart/items` (add-to-cart)

### Required Contract Fields (frozen)

#### Product Images
Each image object MUST include:
- `url`
- `alt`
- `width` (required to prevent CLS)
- `height` (required to prevent CLS)
- `position`

#### Stock Enum
Stock state is strictly frozen to:
- `in_stock`
- `low_stock`
- `out_of_stock`
- `unknown`

#### Pricing Semantics
1. `pricePreview(amount, currency, isFromPrice)` is required for list/detail display semantics.
2. Variants must follow frozen pricing rules:
   - `priceDelta` for relative adjustment OR
   - `absolutePrice` for explicit override
3. If both are provided, precedence and interpretation must be explicitly defined in backend contracts and tests before rollout.

#### Add-to-cart Disabled Reason Enum
`disabledReason` is frozen and must include at minimum:
- `variant_unselected`
- `out_of_stock`
- `dependency_unavailable`

## API Contract Shapes (V1 frozen)

### A) `GET /api/products` (list)
- Success envelope is frozen: `{ "data": { "items": [...], "pagination": { "page": 1, "pageSize": 24, "totalItems": 120, "totalPages": 5 } } }`.
- `items[]` is list-item only (no heavy specs/long description). Required list-item fields: `id`, `slug`, `name`, `images[]`, `pricePreview`, `stock`.
- `pagination` keys are required: `page`, `pageSize`, `totalItems`, `totalPages`.

### B) `GET /api/products/:slug` (detail)
- Success envelope is frozen: `{ "data": { ...productDetail } }`.
- Product detail required fields: `id`, `slug`, `name`, `images[]`, `variants[]`, `pricePreview` (or equivalent base price source), `stock`; `specs` optional.
- Not found behavior is frozen: HTTP `404` with `error.code = "product_not_found"`.

### C) `POST /api/cart/items` (add-to-cart)
- Request body is frozen: `{ "items": [{ "id": "string", "quantity": 1, "variantId": "string|null" }] }` with `quantity >= 1`.
- Success envelope is frozen: `{ "data": { "items": [...], "totals": { "subtotal": 0, "currency": "EUR" } } }`.
- Failure modes are frozen and aligned to disabledReason: `out_of_stock`, `variant_unselected`, `dependency_unavailable`.

### D) Standard error envelope (frozen)
- Canonical API error shape: `{ "error": { "code": "string", "message": "string", "reasonCode": "string?", "requestId": "string?" } }`.
- `reasonCode` is optional and for telemetry alignment; `requestId` remains allowed for runtime parity.
- Status mapping is frozen:
  - `400` validation errors
  - `403` forbidden
  - `404` not found
  - `503` dependency unavailable
  - `503` maintenance / payments disabled

## ErrorBanner Canonical Behavior (V1)

| code | title (canonical) | message (canonical) | retryable |
|---|---|---|---|
| `payments_disabled` | `Paiements indisponibles` | `Paiements indisponibles (maintenance)` | `false` |
| `dependency_unavailable` | `Service temporairement indisponible` | `Une dépendance critique est indisponible. Réessayez.` | `true` |

Rules:
1. `1 code = 1 canonical title/message + retryable(true|false)`.
2. Mapping is identical across checkout, PDP, and add-to-cart surfaces.
3. No copy divergence is allowed across surfaces.
4. Raw `reasonCode` values (for example `db_unavailable` or `redis_unavailable`) MUST NOT be shown directly to end users in V1.

## Required UI Test Hooks (V1 frozen)
1. `data-testid="product-grid"`
2. `data-testid="product-card"`
3. `data-testid="pdp-carousel"`
4. `data-testid="variant-picker"`
5. `data-testid="add-to-cart"`
6. `data-testid="error-banner"` with `data-code="<error_code>"`
7. `data-testid="checkout-submit"`

## Variant + Stock Rules (V1 frozen)
1. If variants exist and no variant is selected, CTA is disabled with `disabledReason="variant_unselected"`.
2. If a variant is selected, variant stock state overrides product stock state.
3. `unknown` stock is fail-closed in V1: CTA disabled with `disabledReason="dependency_unavailable"`.
4. `out_of_stock` always disables CTA with `disabledReason="out_of_stock"`.
5. Rules are identical on PDP and add-to-cart surfaces.

## Anti-butterfly Stop Conditions
Any change to frozen primitives below is blocked unless all linked artifacts are updated in the same change:
1. Envelope shapes and error codes/reasonCode behavior.
2. Pricing semantics.
3. Stock enums.
4. `disabledReason` enum.
5. Required UI test hooks.

Required synchronized updates:
- UI blueprint.
- Acceptance checklist.
- Backend schema/contracts.
- Tests (future implementation track).

No silent drift is allowed.