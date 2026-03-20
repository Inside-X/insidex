# EPIC-5.2D Persistence Gap Freeze

- Version: V1
- Frozen on (UTC): 2026-03-20
- Change policy: this document is immutable for EPIC-5.2D; any change requires a new versioned follow-up document.

## A. Objective

This slice freezes the persistence gap between the already-frozen EPIC-5.2A admin catalogue contract and the current Prisma persistence model.

This task is **docs-only gap freeze and migration-target definition**.

This task changes **no runtime behavior, no Prisma schema, no repository wiring, no route behavior, and no UI implementation**.

## B. Scope Included

This freeze includes:
- explicit comparison between the frozen admin write contract and the current Prisma model
- exact identification of persistence blockers that prevent faithful repository writes today
- the smallest safe future migration target for schema alignment
- explicit invariants that future persistence work must preserve
- a recommended next-step sequence for the follow-up implementation slices

## C. Scope Excluded

This freeze excludes:
- Prisma schema edits
- database migrations
- repository implementation changes
- route changes
- validation changes
- UI changes
- cloud media/upload integration

## D. Source of Truth for This Freeze

This document compares:
- the frozen admin catalogue contract in `docs/epic5/EPIC5_2A_ADMIN_CATALOGUE_CONTRACT_FREEZE.md`
- the current persistence reality in `prisma/schema.prisma`

If those two sources disagree, this document freezes the mismatch and blocks lossy implementation until schema alignment is completed in a dedicated follow-up slice.

## E. Contract Expectation vs Current Persistence Reality

### E.1 Product contract expectations from EPIC-5.2A

The frozen admin contract requires a product write/read shape that includes at minimum:
- `id`
- `name`
- `slug`
- `shortDescription` (optional)
- `description`
- `price` (canonical decimal string)
- `currency`
- `stock`
- `status` with canonical values `draft | published`
- `media[]` with per-item fields:
  - `id`
  - `url`
  - `alt`
  - `sortOrder`
  - `isPrimary`
  - `kind` where the frozen value for this slice is `image`

The frozen contract also requires these media invariants:
- deterministic ordering by `sortOrder`
- duplicate media ids rejected
- duplicate `sortOrder` rejected
- exactly zero or one primary image allowed
- more than one primary image rejected
- zero primary images allowed
- no unknown fields
- no silent dropping of contract fields

### E.2 Current persisted Product reality in Prisma

The current `Product` model persists:
- `id`
- `slug`
- `name`
- `description`
- `status`
- `price`
- `currency`
- `stock`
- `stockStatus`
- `stockQuantity`
- `backorderable`
- `active`
- `deletedAt`
- timestamps

The current `Product` model does **not** persist:
- `shortDescription`

The current persisted `ProductStatus` enum is:
- `draft`
- `active`
- `archived`

This does **not** match the frozen admin contract status set of:
- `draft`
- `published`

### E.3 Current persisted ProductImage reality in Prisma

The current `ProductImage` model persists:
- `id`
- `productId`
- `url`
- `alt`
- `width`
- `height`
- `position`
- timestamps

The current `ProductImage` model does **not** persist:
- `isPrimary`
- `kind`

The current schema does provide:
- a uniqueness constraint on `[productId, position]`

That uniqueness constraint can help enforce deterministic ordering and prevent duplicate positions at the database level, but it does **not** represent:
- primary-image semantics
- media kind/type semantics

## F. Frozen Persistence Blockers

The following blockers are frozen and must be treated as implementation blockers for faithful repository writes against the current model.

### F.1 Missing `shortDescription` persistence

Blocker:
- The frozen contract includes optional `shortDescription`.
- The current `Product` model has no column for `shortDescription`.

Why this blocks faithful mapping:
- Silently dropping `shortDescription` violates the contract freeze.
- Repository/tests must not encode or assert field loss as acceptable behavior.

### F.2 Status enum mismatch

Blocker:
- The frozen contract requires canonical product status values `draft | published`.
- The current persisted enum is `draft | active | archived`.

Why this blocks faithful mapping:
- Mapping `published` to `active` would be an inferred translation rather than faithful persistence of the frozen contract.
- That translation is not frozen anywhere in EPIC-5.2A and therefore must not be invented inside repository code.

### F.3 Missing media primary semantics

Blocker:
- The frozen contract requires `isPrimary` on every media item and constrains the list to zero or one primary image.
- The current `ProductImage` model has no persisted field or relation for primary-image semantics.

Why this blocks faithful mapping:
- Repository code cannot persist which image is primary.
- Primary-image invariants cannot be reconstructed faithfully from the current stored shape.

### F.4 Missing media kind/type semantics

Blocker:
- The frozen contract requires `kind` on every media item, frozen to `image` for this slice.
- The current `ProductImage` model has no persisted field for media kind/type.

Why this blocks faithful mapping:
- Repository code would need to inject or reconstruct a non-persisted field.
- Even if the only currently allowed value is `image`, silently manufacturing it from missing persistence is not faithful schema support.

### F.5 Persistence requires `width` and `height`, but the contract does not

Blocker:
- The current `ProductImage` model requires both `width` and `height`.
- The frozen contract media write shape does not include `width` or `height`.

Why this blocks faithful mapping:
- Repository code cannot write a `ProductImage` row without inventing values that were not supplied by the contract.
- Placeholder values such as `width: 0` and `height: 0` are lossy and must not be treated as canonical unless a separate contract or schema freeze explicitly establishes them, which has not happened here.

### F.6 Field-name mismatch: `sortOrder` in contract vs `position` in persistence

Relevant mismatch:
- The contract uses `sortOrder`.
- The current schema persists `position`.

Why this is not the primary blocker by itself:
- A simple, explicit repository mapping between `sortOrder` and `position` would be faithful if the rest of the media model were otherwise aligned.

Why it still matters:
- Future implementation must preserve deterministic semantics and reject duplicate/tied sort values before persistence.
- This mapping must remain explicit and documented rather than implicit.

### F.7 Additional relevant model mismatch: archive state exists in persistence but not in the frozen admin contract

Relevant mismatch:
- The current `ProductStatus` enum includes `archived`.
- The EPIC-5.2A admin contract does not expose `archived` as an allowed admin write status.

Why this matters:
- Future alignment must define whether `archived` remains an internal persistence concern, is removed, or is explicitly excluded from the EPIC-5.2A admin write path.
- Repository code for this slice must not expose or depend on undocumented archive semantics.

## G. Smallest Safe Migration Target

This section freezes the minimal schema-alignment target required before faithful repository/runtime work resumes.

### G.1 Product changes required

Future schema alignment must, at minimum:
- add persisted `shortDescription` to `Product`
- align persisted product status representation with the frozen admin contract so that `published` is a first-class persisted state

Smallest safe target:
- `Product.shortDescription`: nullable/optional persisted string
- `Product.status`: persisted enum aligned to the contract write semantics for this slice, with `draft` and `published` available as canonical persisted values for admin catalogue writes

Open design note to preserve safety:
- If broader application flows still require archive semantics, that must be handled explicitly in the migration design rather than implicitly remapping contract values.
- The migration must document whether `archived` remains as an extra enum value outside this admin write contract or is removed/reworked in a separate slice.

### G.2 ProductImage changes required

Future schema alignment must, at minimum:
- add persisted representation for primary-image semantics
- add persisted representation for media kind/type semantics
- resolve the current requirement for `width` and `height` so repository writes do not have to invent values absent from the frozen contract

Smallest safe target:
- add `ProductImage.isPrimary` as a persisted boolean
- add `ProductImage.kind` as a persisted string or enum aligned to the frozen contract, with `image` supported as the canonical value for this slice
- change `ProductImage.width` and `ProductImage.height` so they are no longer required for EPIC-5.2A admin contract writes unless a future contract freeze explicitly introduces them

Safe interpretation of the width/height requirement:
- Either make `width` and `height` nullable/optional, or move them behind a separate metadata population flow.
- The future migration must not require admin catalogue repository writes to fabricate these values.

### G.3 Enum/status alignment required

Future schema alignment must explicitly define one of the following safe outcomes:
- migrate the persisted product status enum so the admin write path persists `draft | published` canonically, or
- preserve additional non-admin states only if they are explicitly documented and do not force repository-level remapping of EPIC-5.2A contract statuses

Minimum requirement:
- `published` must be a real persisted state for the admin write path
- `draft` must remain a real persisted state
- no repository layer translation from `published` to some other stored state may be silently introduced

## H. Invariants That Must Be Preserved After Migration

Any future migration and implementation slice must preserve all of the following:

### H.1 Product invariants
- `slug` remains unique at the product level
- `price` remains server-canonical and not floating-point
- `currency` remains constrained to the frozen contract for this slice
- `stock` remains a non-negative integer in the admin contract path
- `shortDescription` must persist when supplied and must not be silently dropped
- admin write status semantics must remain canonically `draft | published` for this slice

### H.2 Media invariants
- persisted ordering must faithfully correspond to ascending `sortOrder`
- duplicate sort positions must be rejected
- duplicate media ids must be rejected
- zero or one primary image allowed
- more than one primary image rejected
- `kind` must persist faithfully for each media item
- repository writes must not invent `width`/`height` values absent from the contract

### H.3 Behavior that must NOT be invented or defaulted silently

The following must **not** be introduced silently in repository/runtime code:
- dropping `shortDescription`
- translating `published` to `active` without explicit schema/contract alignment
- discarding `isPrimary`
- discarding `kind`
- defaulting `width` or `height` to placeholder values such as `0`
- inferring a primary image from sort order unless a later contract freeze explicitly defines that behavior
- synthesizing contract response fields that are not faithfully backed by persistence

## I. Safe Recommended Next-Step Sequence

Future work should proceed in the following order only:

1. **Prisma schema alignment and migration**
   - Add/adjust the exact `Product` and `ProductImage` persistence fields frozen in this document.
   - Align persisted status semantics with the admin contract.
   - Resolve the `width`/`height` requirement safely without placeholder fabrication.
   - Define database-level constraints/indexes needed to support deterministic ordering and primary-image invariants where appropriate.

2. **Repository faithful mapping**
   - Only after schema alignment, implement repository write primitives that persist every required contract field without lossy fallbacks.
   - Ensure repository tests assert faithful persistence rather than tolerated omission.

3. **Route wiring to persistence**
   - Wire admin routes to the corrected repository layer only after faithful persistence support exists.
   - Keep validation fail-closed against the frozen contract.

4. **UI and admin workflow integration**
   - Integrate admin UX flows only after persistence and route behavior are both contract-aligned and tested.

## J. Explicit Slice Boundary

For avoidance of doubt, this EPIC-5.2D slice is:
- **docs-only**
- **no runtime behavior changes**
- **no Prisma schema changes**
- **no repository wiring**
- **no route wiring**
- **no test changes**

Any attempt to implement repository/runtime persistence behavior before the schema-alignment slice is complete would violate this freeze.
