# EPIC-5.2O Orphan Finalized Asset Operational Policy & Consistency Freeze

- Version: V1
- Frozen on (UTC): 2026-03-27
- Type: docs-only policy freeze
- Change policy: immutable for EPIC-5.2O; any change requires a new versioned follow-up freeze.

## 1) Objective

Freeze conservative operational policy and consistency boundaries for orphaned finalized assets before any cleanup/retention runtime implementation is introduced.

This slice is policy-only and changes no runtime routes, schema, repository behavior, provider behavior, tests, or UI.

## 2) Sources of truth compared in this freeze

Primary comparison set:
- `docs/epic5/EPIC5_2A_ADMIN_CATALOGUE_CONTRACT_FREEZE.md`
- `docs/epic5/EPIC5_2G_ADMIN_MEDIA_UPLOAD_CONTRACT_FREEZE.md`
- `docs/epic5/EPIC5_2M_FINALIZED_ASSET_LIFECYCLE_FREEZE.md`
- `prisma/schema.prisma`
- `src/routes/admin-products.routes.js`
- `src/routes/admin-media.routes.js`
- `src/repositories/product.repository.js`
- `src/repositories/media-upload.repository.js`

## 3) Current observed runtime/persistence reality (frozen baseline)

1. Finalized uploaded assets are persisted in `media_uploaded_assets`.
2. Product media references are persisted independently in `product_images` and linked by URL semantics, not by hard FK to uploaded assets.
3. Product media replace semantics (`PUT /api/admin/products/:id/media`) can remove prior product references in a single operation.
4. Current runtime enforces finalized-url existence and same-payload duplicate-url rejection, but does not implement cleanup/orphan lifecycle jobs.
5. No current runtime component performs automatic deletion of finalized assets when product references are detached/removed.

This baseline is descriptive only and does not imply broader cleanup authorization.

## 4) Orphaned finalized asset definition (frozen)

An orphaned finalized asset is any finalized uploaded asset whose URL has **zero current committed product media references** across all products.

Clarifications:
- Orphan determination is based on current committed catalog state, not client intent.
- Orphan status is operational/derived state, not a mandatory persisted enum in this slice.
- A finalized asset may transition between orphaned and attached over time as product media changes.

## 5) Attachment / detachment semantics (frozen)

### 5.1 Attachment semantics
- Finalized assets remain generic persisted artifacts.
- Referencing a finalized asset URL in product media constitutes attachment-by-reference only.
- Attachment does not grant exclusivity/ownership to any product.

### 5.2 Detachment semantics
- Removing a product media reference detaches that product from the asset URL.
- If no product references remain, the asset becomes orphaned by definition.
- Detachment/orphaning **does not authorize deletion by itself**.

## 6) Retention and cleanup policy boundaries (frozen)

### 6.1 Retention decision in this slice
**Decision (frozen): Retain orphaned finalized assets by default.**

Rationale:
- Safest posture against accidental data loss.
- Current model lacks explicit ownership/retention provenance needed for safe destructive automation.
- Preserves recoverability and re-attach options.

### 6.2 Cleanup status in this slice
**Decision (frozen): cleanup implementation is deferred.**

Interpretation:
- No automatic scheduled cleanup is authorized by this slice.
- No manual hard-delete operational runbook is authorized by this slice.
- Any cleanup mechanism requires dedicated follow-up freeze with explicit risk controls.

## 7) Operational visibility expectations (frozen)

This slice allows non-destructive operational visibility only:
- future read-only reporting of orphan candidate counts,
- age distribution of orphan candidates,
- reference-count diagnostics,
- provider/object existence reconciliation signals.

No visibility feature in this slice may mutate/delete assets.

## 8) Future runtime enforcement/ops tooling boundaries

### 8.1 Explicitly allowed in future slices (with dedicated implementation scope)
- Add read-only orphan/reference observability.
- Add conservative candidate-marking workflows (non-destructive).
- Add soft-delete/quarantine pipelines with explicit safety windows.
- Add auditable approval gates for any irreversible delete action.

### 8.2 Explicitly forbidden until a later dedicated slice
Future slices must not, without a dedicated policy/version freeze:
- Hard-delete orphaned finalized assets automatically.
- Delete finalized assets as side effects of product media write endpoints.
- Treat detachment as immediate destruction authorization.
- Introduce implicit ownership assumptions that break cross-product reuse allowances.
- Perform provider object deletion without parity checks and rollback/compensation strategy.

## 9) Consistency guardrails future implementations must honor

1. Product media writes remain authoritative for catalog presentation, not for destructive asset lifecycle side effects.
2. Orphan classification must be deterministic and recomputable from committed state.
3. Any cleanup workflow must be explicit, auditable, and reversible where feasible prior to hard delete.
4. Existing valid product media URLs must never be invalidated by orphan cleanup logic.
5. Cleanup policy changes require explicit versioned contract/freeze updates.

## 10) Explicitly out of scope for EPIC-5.2O

- Runtime cleanup scheduler/job implementation.
- New API routes for cleanup actions.
- Prisma schema changes or new lifecycle tables.
- Repository behavior changes.
- Validation schema changes.
- Provider behavior changes.
- Test changes.
- UI changes.

## 11) Recommended next-step sequence (post-freeze)

1. **Observability slice:** add read-only orphan/reference metrics and diagnostics.
2. **Safety-controls slice:** freeze grace-period, quarantine, and audit requirements.
3. **Controlled cleanup slice:** implement non-destructive candidate marking and dry-run tooling.
4. **Deletion slice (optional and gated):** only after prior slices, add explicitly approved irreversible cleanup paths.
5. **Ongoing governance:** maintain versioned policy docs for any destructive behavior changes.

## 12) Final freeze summary

- Orphan definition: finalized asset with zero current product media references.
- Orphan handling now: retained by default; no implicit deletion.
- Detach semantics: may create orphan state, but does not authorize cleanup/deletion.
- Cleanup status: deferred; destructive behavior forbidden until dedicated follow-up freeze.
- Allowed near-term ops: read-only visibility and conservative, non-destructive preparation only.
