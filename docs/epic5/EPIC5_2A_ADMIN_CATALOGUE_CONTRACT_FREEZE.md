# EPIC-5.2A Admin Catalogue Contract Freeze

- Version: V1
- Frozen on (UTC): 2026-03-19
- Change policy: this document is immutable for EPIC-5.2A; any change requires a new versioned follow-up document.

## A. Objective

This slice freezes the admin catalogue/media management contract and acceptance criteria required for safe implementation of the next EPIC-5 admin step.

This task is **contract and acceptance freeze only**.

This task changes **no runtime behavior, routes, schemas, authorization logic, or UI implementation**.

## B. Scope Included

This freeze includes:
- admin create product contract
- admin update product contract
- admin publish/unpublish visibility contract
- admin media list/order/primary-image contract
- validation and error envelope expectations
- deterministic UI hooks required for future admin UI tests

## C. Scope Excluded

This freeze excludes:
- cloud upload provider integration
- drag-and-drop media ordering implementation
- visual admin UI implementation
- front-end styling implementation
- runtime authorization changes

## D. Canonical Product Write Contract

### D.1 Shared write rules

- All admin write endpoints are fail-closed.
- Unknown request fields are rejected with `VALIDATION_ERROR`.
- The server is the canonical source for normalized persisted values.
- `price` is a canonical decimal string on the server, never a floating-point number.
- `currency` is an uppercase ISO-style currency code; EPIC-5.2A freezes `EUR` as the only accepted value unless a later version explicitly expands support.
- `stock` is a non-negative integer.
- `status` is `draft` or `published` only.
- `slug` is unique at the product level.
- `description` is the full product description.
- `shortDescription` is an optional concise summary used for list/admin preview contexts.
- `media` ordering is deterministic and represented by explicit `sortOrder` integers.
- Media `kind` is frozen to `image` for this slice.

### D.2 Canonical product shape

```json
{
  "id": "prod_123",
  "name": "Amani Chair",
  "slug": "amani-chair",
  "shortDescription": "Oak chair with woven seat.",
  "description": "Full product description.",
  "price": "129.90",
  "currency": "EUR",
  "stock": 8,
  "status": "draft",
  "media": [
    {
      "id": "media_001",
      "url": "https://cdn.example.com/products/amani-chair/main.jpg",
      "alt": "Amani Chair front view",
      "sortOrder": 0,
      "isPrimary": true,
      "kind": "image"
    }
  ]
}
```

### D.3 `POST /api/admin/products`

Creates a new admin-managed product.

**Request**

```json
{
  "name": "Amani Chair",
  "slug": "amani-chair",
  "shortDescription": "Oak chair with woven seat.",
  "description": "Full product description.",
  "price": "129.90",
  "currency": "EUR",
  "stock": 8,
  "status": "draft",
  "media": [
    {
      "id": "media_001",
      "url": "https://cdn.example.com/products/amani-chair/main.jpg",
      "alt": "Amani Chair front view",
      "sortOrder": 0,
      "isPrimary": true,
      "kind": "image"
    }
  ]
}
```

**Response (`201`)**

```json
{
  "data": {
    "id": "prod_123",
    "name": "Amani Chair",
    "slug": "amani-chair",
    "shortDescription": "Oak chair with woven seat.",
    "description": "Full product description.",
    "price": "129.90",
    "currency": "EUR",
    "stock": 8,
    "status": "draft",
    "media": [
      {
        "id": "media_001",
        "url": "https://cdn.example.com/products/amani-chair/main.jpg",
        "alt": "Amani Chair front view",
        "sortOrder": 0,
        "isPrimary": true,
        "kind": "image"
      }
    ]
  }
}
```

**Validation rules**
- `name`: required, trimmed, non-empty.
- `slug`: required, lowercase canonical slug format; if provided it must already be normalized. Server rejects malformed slugs instead of silently accepting alternate formats.
- `shortDescription`: optional; if present, trimmed string.
- `description`: required, trimmed, non-empty.
- `price`: required decimal string with `.` separator and exactly two fractional digits.
- `currency`: required, must equal `EUR`.
- `stock`: required integer, `>= 0`.
- `status`: optional on create; defaults to `draft` when omitted. If supplied, must be `draft` or `published`.
- `media`: optional; if present, must satisfy all media invariants below.

### D.4 `PATCH /api/admin/products/:id`

Updates mutable product fields without changing endpoint shape semantics.

**Request**

```json
{
  "name": "Amani Lounge Chair",
  "slug": "amani-lounge-chair",
  "shortDescription": "Updated short summary.",
  "description": "Updated full description.",
  "price": "149.90",
  "currency": "EUR",
  "stock": 5,
  "status": "draft"
}
```

**Response (`200`)**

```json
{
  "data": {
    "id": "prod_123",
    "name": "Amani Lounge Chair",
    "slug": "amani-lounge-chair",
    "shortDescription": "Updated short summary.",
    "description": "Updated full description.",
    "price": "149.90",
    "currency": "EUR",
    "stock": 5,
    "status": "draft",
    "media": [
      {
        "id": "media_001",
        "url": "https://cdn.example.com/products/amani-chair/main.jpg",
        "alt": "Amani Chair front view",
        "sortOrder": 0,
        "isPrimary": true,
        "kind": "image"
      }
    ]
  }
}
```

**Validation rules**
- Partial update is allowed only for known mutable fields in this contract: `name`, `slug`, `shortDescription`, `description`, `price`, `currency`, `stock`, `status`.
- At least one known field must be present.
- Unknown fields are rejected.
- `slug` changes must still satisfy normalization/uniqueness rules.
- `status` may be updated here, but publish/unpublish endpoints remain the canonical explicit visibility actions for future admin UX flows.

### D.5 `PATCH /api/admin/products/:id/publish`

Makes a product visible by setting canonical status to `published`.

**Request**

```json
{}
```

**Response (`200`)**

```json
{
  "data": {
    "id": "prod_123",
    "status": "published"
  }
}
```

**Rules**
- Endpoint is idempotent for already-published products.
- Product must exist.
- Publish does not rewrite unrelated product fields.

### D.6 `PATCH /api/admin/products/:id/unpublish`

Removes product visibility by setting canonical status to `draft`.

**Request**

```json
{}
```

**Response (`200`)**

```json
{
  "data": {
    "id": "prod_123",
    "status": "draft"
  }
}
```

**Rules**
- Endpoint is idempotent for already-draft products.
- Product must exist.
- Unpublish does not rewrite unrelated product fields.

### D.7 `PUT /api/admin/products/:id/media`

Replaces the full persisted media list for a product.

**Request**

```json
{
  "media": [
    {
      "id": "media_001",
      "url": "https://cdn.example.com/products/amani-chair/main.jpg",
      "alt": "Amani Chair front view",
      "sortOrder": 0,
      "isPrimary": true,
      "kind": "image"
    },
    {
      "id": "media_002",
      "url": "https://cdn.example.com/products/amani-chair/side.jpg",
      "alt": "Amani Chair side view",
      "sortOrder": 1,
      "isPrimary": false,
      "kind": "image"
    }
  ]
}
```

**Response (`200`)**

```json
{
  "data": {
    "id": "prod_123",
    "media": [
      {
        "id": "media_001",
        "url": "https://cdn.example.com/products/amani-chair/main.jpg",
        "alt": "Amani Chair front view",
        "sortOrder": 0,
        "isPrimary": true,
        "kind": "image"
      },
      {
        "id": "media_002",
        "url": "https://cdn.example.com/products/amani-chair/side.jpg",
        "alt": "Amani Chair side view",
        "sortOrder": 1,
        "isPrimary": false,
        "kind": "image"
      }
    ]
  }
}
```

**Media item rules**
- Every media item must include `id`, `url`, `alt`, `sortOrder`, `isPrimary`, `kind`.
- `id`: required non-empty string; duplicates are rejected.
- `url`: required absolute URL string.
- `alt`: required non-empty string.
- `sortOrder`: required integer, `>= 0`.
- `isPrimary`: required boolean.
- `kind`: required string, must equal `image`.

**Media invariants**
- Exactly zero or one primary image is allowed.
- More than one `isPrimary: true` item is rejected.
- Zero primary images is allowed.
- Duplicate media ids are rejected.
- Malformed media items are rejected.
- Unknown media item fields are rejected.
- Sort order must be deterministic: persisted list order matches ascending `sortOrder`; ties are rejected as invalid.
- Validation fails closed for any invariant breach.

## E. Error Envelope Expectations

Canonical admin error envelope must match current main runtime conventions:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request payload",
    "details": [
      { "field": "price", "message": "Expected string, received number" }
    ],
    "requestId": "req_123"
  }
}
```

Notes:
- `details` is the canonical structured validation payload; this slice does not introduce a `fields` object.
- `requestId` is included when present on the request context.

Frozen error codes:

| HTTP | code | Example meaning |
|---|---|---|
| `400` | `VALIDATION_ERROR` | malformed payload, unknown field, invariant violation |
| `401` | `UNAUTHORIZED` | missing or invalid authentication |
| `403` | `FORBIDDEN` | authenticated but not permitted |
| `404` | `NOT_FOUND` | product id does not exist |
| `409` | `CONFLICT` | slug collision or conflicting state transition |
| `500` | `INTERNAL_ERROR` | unexpected server failure |

Concise examples:

**`VALIDATION_ERROR`**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request payload",
    "details": [
      { "field": "media.1.sortOrder", "message": "Duplicate sortOrder is not allowed." }
    ]
  }
}
```

**`UNAUTHORIZED`**
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required",
    "details": []
  }
}
```

**`FORBIDDEN`**
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Insufficient permissions",
    "details": []
  }
}
```

**`NOT_FOUND`**
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Product not found.",
    "details": []
  }
}
```

**`CONFLICT`**
```json
{
  "error": {
    "code": "CONFLICT",
    "message": "Slug already exists.",
    "details": []
  }
}
```

**`INTERNAL_ERROR`**
```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Internal server error",
    "details": []
  }
}
```

## F. Future Admin UI Hooks

The future admin UI must expose deterministic test hooks with stable `data-testid` values.

Minimum frozen hooks for this slice:
- `data-testid="admin-product-form"`
- `data-testid="admin-product-name"`
- `data-testid="admin-product-slug"`
- `data-testid="admin-product-short-description"`
- `data-testid="admin-product-description"`
- `data-testid="admin-product-price"`
- `data-testid="admin-product-currency"`
- `data-testid="admin-product-stock"`
- `data-testid="admin-product-status"`
- `data-testid="admin-product-save"`
- `data-testid="admin-product-publish"`
- `data-testid="admin-product-unpublish"`
- `data-testid="admin-product-validation-summary"`
- `data-testid="admin-product-save-state"`
- `data-testid="admin-product-media-list"`
- `data-testid="admin-product-media-item"`
- `data-testid="admin-product-media-primary"`
- `data-testid="admin-product-media-sort-order"`
- `data-testid="admin-product-media-alt"`

Rule: these hooks are acceptance-surface contracts and must not be renamed casually once runtime work starts.

## G. Modern UX Acceptance Direction

Future UI implementation acceptance must satisfy all of the following:
- modern 2024+ admin look and feel
- clean spacing
- clear hierarchy
- strong readability
- responsive layout
- no clutter
- explicit confirmation for destructive actions
- visible validation feedback
- visible save-state feedback

This section is guidance for future acceptance only; it is not a styling or component implementation spec.

## H. Done Criteria

Later implementation is complete only when all items below are true:
- admin product create/update/publish/unpublish/media routes match this frozen contract
- validation rejects unknown fields and malformed media items
- price persistence uses canonical decimal strings
- media ordering and primary-image invariants are enforced deterministically
- canonical error envelope and codes are returned consistently
- future admin UI exposes the frozen deterministic test hooks
- acceptance tests cover success, validation failure, not-found, conflict, and permission scenarios
- runtime implementation lands without widening scope beyond this freeze

## Proposed for Next Slice Only

The following are explicitly **not** part of EPIC-5.2A implementation and remain proposed follow-up concerns:
- provider-backed upload initiation/finalization contracts
- drag-and-drop media reordering UX details
- image transformation/thumbnail derivation contracts