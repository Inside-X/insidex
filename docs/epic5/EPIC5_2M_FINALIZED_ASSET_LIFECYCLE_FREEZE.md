# EPIC-5.2M Finalized Asset Lifecycle / Reuse Policy Freeze

- Version: V1
- Frozen on (UTC): 2026-03-26
- Type: docs-only policy freeze
- Change policy: immutable for EPIC-5.2M; any change requires a new versioned follow-up freeze.

## 1) Objective

Freeze conservative lifecycle and reuse semantics for finalized uploaded assets before any additional runtime enforcement is introduced.

This slice is policy-only. It changes no runtime code, contracts, schema, repository behavior, provider behavior, tests, or UI.

## 2) Sources of truth compared in this freeze

Primary comparison set:
- `docs/epic5/EPIC5_2A_ADMIN_CATALOGUE_CONTRACT_FREEZE.md`
- `docs/epic5/EPIC5_2G_ADMIN_MEDIA_UPLOAD_CONTRACT_FREEZE.md`
- `prisma/schema.prisma`
- `src/routes/admin-products.routes.js`
- `src/routes/admin-media.routes.js`
- `src/repositories/product.repository.js`
- `src/repositories/media-upload.repository.js`

## 3) Current observed runtime/persistence reality (frozen as baseline)

### 3.1 Upload/finalize persistence reality
- Upload sessions are persisted in `media_upload_sessions`.
- Finalized assets are persisted in `media_uploaded_assets`.
- Finalize idempotency is persisted in `media_upload_finalize_idempotency` keyed by `(uploadId, idempotencyKey)`.
- A single upload session can produce one or more asset rows over time in persistence terms; runtime idempotency only guarantees replay safety per `(uploadId, idempotencyKey)`.

### 3.2 Product media write reality
- Product media writes are still authoritative via `PUT /api/admin/products/:id/media` replace semantics.
- Runtime only verifies that each submitted `media[].url` exists in finalized assets (`findFinalizedAssetsByUrls`).
- There is currently no persisted direct relation from `product_images` to `media_uploaded_assets` (URL linkage only).
- There is currently no runtime rule that prevents the same finalized URL from appearing in multiple products.
- There is currently no runtime rule that prevents duplicate URL entries within one submitted product media payload.

This freeze does not reinterpret these as desired end-state behavior; it only records baseline reality.

## 4) Conceptual lifecycle states (policy model)

To remove ambiguity, finalized assets are frozen with these conceptual states:

1. **UploadSessionCreated**
   - Upload slot exists; no finalized asset yet.
2. **FinalizedUnattached**
   - Finalized asset exists in canonical uploaded-assets store.
   - Not yet referenced by any committed product media list.
3. **FinalizedAttached**
   - Finalized asset URL is referenced by at least one committed product media entry.
4. **FinalizedOrphaned**
   - Previously attached finalized asset is no longer referenced by any product media entry.
   - Still retained as a persisted asset artifact until retention rules decide cleanup.
5. **FinalizedDeleted (future-only operational state)**
   - Physical/logical deletion performed by an explicit future cleanup workflow.
   - Not implemented in this slice.

State transitions are conceptual in this slice; runtime enforcement is deferred to future slices.

## 5) Relationship freeze: finalized assets vs product media entries

### 5.1 Allowed relationship cardinality (policy)
- A product media entry **must** reference a URL that corresponds to a finalized uploaded asset.
- A finalized uploaded asset URL **may** be referenced by zero or more product media entries across catalog scope.
- Product media remains the presentation/order surface; uploaded assets remain the storage provenance surface.

### 5.2 Attachment semantics (policy)
- Finalized assets are frozen as **generic storage artifacts**, not product-owned records.
- Referencing an asset from product media marks it **attached-by-reference**, but does **not** grant exclusivity to that product.
- Attachment is semantic/reference-level only in this slice (no new hard FK/ownership model).

## 6) Reuse policy freeze

### 6.1 Reuse across different products
**Decision (frozen): ALLOWED**.

Rationale:
- Safest near-term integrity posture is to avoid destructive exclusivity assumptions without explicit ownership model.
- Existing persistence/runtime do not encode safe exclusivity constraints.
- Allowing reuse avoids accidental data loss from over-aggressive cleanup tied to single-product ownership assumptions.

Constraint for future runtime slices:
- Future enforcement must not retroactively invalidate already-persisted cross-product reuse without a migration + compatibility policy freeze.

### 6.2 Duplicate use inside one product media payload
**Decision (frozen): DEFERRED for enforcement; DISCOURAGED by policy.**

Interpretation:
- Current runtime may permit duplicate URL entries in one payload.
- This slice does not mandate immediate runtime rejection.
- Future hardening is expected to move toward rejecting duplicate finalized URLs within a single product media payload for data quality, but only in an explicit follow-up slice with contract/version impact review.

Constraint for future runtime slices:
- Any transition from permissive to reject-duplicate behavior must be announced in a dedicated contract/version freeze.

## 7) Orphaned finalized asset policy

### 7.1 Definition
An orphaned finalized asset is a finalized uploaded asset with zero current product media references.

### 7.2 Policy freeze
- Orphaned finalized assets are **valid persisted artifacts**.
- They must **not** be automatically deleted as a side effect of product media replacement/update in current/following slices unless a dedicated cleanup policy slice explicitly authorizes it.
- Orphans remain eligible for later re-attachment and for controlled cleanup workflows.

## 8) Retention / cleanup policy boundaries

### 8.1 What is allowed after this freeze
Future runtime slices may add:
- Read-only observability/reporting for attachment/reference counts.
- Explicit admin/system cleanup jobs with conservative grace periods.
- Soft-delete or quarantine stages before hard delete.
- Provider object reconciliation checks.

### 8.2 What is forbidden without a new freeze
Future slices must not, without a new explicit policy freeze:
- Perform immediate hard delete of finalized assets on product media detach.
- Assume one-to-one product ownership of finalized assets.
- Introduce implicit destructive cleanup side effects in product write endpoints.
- Change reuse-across-products from allowed to forbidden without migration/compatibility plan.

## 9) Error/behavior expectations future runtime slices must honor

1. Product media writes remain fail-closed for non-finalized URLs.
2. Any new enforcement added for duplicate-in-payload behavior must be deterministic and contract-documented before activation.
3. Cleanup actions must be explicit, auditable, and reversible when feasible (e.g., grace-period or soft-delete first).
4. Idempotency guarantees for finalize must remain intact.
5. No cleanup rule may break existing product media URLs that still reference finalized assets.

## 10) Explicitly out of scope for EPIC-5.2M

- Runtime implementation of new attachment tracking fields.
- Prisma schema changes.
- New API routes.
- Validation schema changes.
- Repository behavior changes.
- Provider behavior changes.
- Test suite changes.
- UI changes.

## 11) Recommended next-step sequence (post-freeze)

1. **Reference observability slice (non-destructive):** add internal reporting for finalized asset reference usage and orphan counts.
2. **Duplicate policy decision slice:** decide and freeze whether to reject duplicate finalized URLs within a single product payload; include compatibility handling.
3. **Cleanup lifecycle slice:** define grace period, soft-delete/quarantine semantics, and irreversible deletion controls.
4. **Optional ownership/attachment model slice:** only if needed, introduce explicit asset-reference linkage model with migration plan.
5. **Then runtime hardening:** implement strictly in the order frozen above.

## 12) Final freeze summary

- Cross-product finalized-asset reuse: **allowed**.
- Same-product duplicate URL enforcement: **deferred (currently permissive runtime; future tightening requires explicit follow-up freeze)**.
- Finalized assets: **generic persisted artifacts with attachment-by-reference semantics**.
- Orphaned finalized assets: **retained; no implicit destructive cleanup authorized**.
- Cleanup/retention: **bounded to explicit future slices; no hidden side effects allowed**.
