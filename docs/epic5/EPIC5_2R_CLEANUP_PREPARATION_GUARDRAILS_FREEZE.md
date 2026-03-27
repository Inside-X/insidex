# EPIC-5.2R Cleanup Preparation / Operational Guardrails Freeze

- Version: V1
- Frozen on (UTC): 2026-03-27
- Type: docs-only policy freeze
- Change policy: immutable for EPIC-5.2R; any change requires a new versioned follow-up freeze.

## 1) Objective

Freeze conservative cleanup-preparation preconditions and operational guardrails for finalized/orphaned uploaded assets **before** any runtime cleanup implementation (manual or automated) is introduced.

This slice is policy-only. It introduces no runtime behavior, no cleanup APIs, no schema changes, and no deletion workflows.

## 2) Sources of truth compared in this freeze

Primary comparison set:
- `docs/epic5/EPIC5_2G_ADMIN_MEDIA_UPLOAD_CONTRACT_FREEZE.md`
- `docs/epic5/EPIC5_2M_FINALIZED_ASSET_LIFECYCLE_FREEZE.md`
- `docs/epic5/EPIC5_2O_ORPHAN_ASSET_OPERATIONAL_POLICY_FREEZE.md`
- `prisma/schema.prisma`
- `src/routes/admin-media.routes.js`
- `src/repositories/media-upload.repository.js`

## 3) Current observed runtime/persistence reality (frozen baseline)

1. Upload sessions and finalized uploaded assets are persisted (`media_upload_sessions`, `media_uploaded_assets`), with finalize idempotency persisted separately.
2. Product media references are persisted independently in `product_images`, linked to finalized assets by URL semantics (no hard FK from product media rows to uploaded asset rows).
3. Runtime already exposes read-only visibility for finalized assets and orphaned assets, including linkage indicators (`isReferenced`, `referenceCount`) derived from committed product media references.
4. Product media writes remain authoritative through replace semantics and must stay non-destructive with respect to uploaded-asset lifecycle.
5. No runtime/manual/automated cleanup deletion behavior currently exists.

This baseline is descriptive only; it does not authorize cleanup implementation.

## 4) Cleanup readiness prerequisites (must all be true before implementation work)

Cleanup runtime/tooling work is blocked until all prerequisites below are explicitly satisfied in a follow-up implementation slice:

1. **Policy prerequisites**
   - EPIC-5.2M reuse policy remains honored (no implicit exclusivity assumptions).
   - EPIC-5.2O orphan definition remains authoritative (orphan = zero committed references).
   - This EPIC-5.2R guardrails freeze remains explicitly referenced by any cleanup implementation PR/plan.

2. **Data/model prerequisites**
   - Orphan classification logic is deterministic and recomputable from committed state.
   - Candidate selection query/algorithm is deterministic and testable (stable ordering and explicit boundaries).
   - No cleanup logic depends on mutable client intent; committed persistence state is sole source of truth.

3. **Safety/control prerequisites**
   - A non-destructive dry-run capability exists first (candidate listing without mutation/deletion).
   - Explicit operator confirmation/approval steps are defined before destructive actions are allowed.
   - Rollback/compensation strategy is defined for each destructive stage where feasible.

If any prerequisite above is missing, cleanup implementation is **deferred by policy**.

## 5) Required observability/visibility prerequisites before cleanup is allowed

Before any cleanup action can be implemented, minimum operational visibility must exist and be validated:

1. Deterministic candidate visibility:
   - finalized asset identity,
   - orphan/reference state,
   - reference count,
   - asset age signals (created/finalized timestamps),
   - candidate selection reason codes.

2. Safety visibility:
   - explicit count of assets that would be affected by a proposed cleanup run,
   - explicit count of skipped assets with deterministic skip reasons,
   - explicit count of conflicts/guardrail rejections.

3. Audit visibility:
   - immutable run-level audit record (who/what/when/why),
   - item-level outcomes (selected/skipped/deleted/deferred),
   - correlation ID linkage across logs/events.

4. Fail-closed visibility behavior:
   - if required visibility cannot be produced, cleanup action must not execute.

## 6) Minimum safe operator checks before any future cleanup action

A future manual cleanup operation must require at least all checks below:

1. Confirm candidate set computed from current committed state at execution time (no stale snapshot assumption).
2. Confirm each candidate currently has `referenceCount = 0` at commit point of deletion action.
3. Confirm configured guardrail windows are satisfied (minimum age / grace period from finalize and/or detachment event policy).
4. Confirm explicit dry-run preview output matches execution target set.
5. Confirm explicit operator acknowledgement that action is irreversible (or define reversible intermediate stage first).
6. Confirm audit metadata is present (operator identity, rationale, request/ticket reference).

If any check fails, operation must fail closed with no mutation.

## 7) Manual cleanup boundaries (frozen)

### 7.1 Allowed in future manual cleanup slices (only with dedicated implementation freeze)
- Read-only candidate listing and dry-run simulation.
- Explicitly approved, bounded-scope manual runs with strict audit trails.
- Conservative staged flows (e.g., mark/quarantine first, hard delete only in later gated stage).

### 7.2 Not allowed now
- Direct hard-delete endpoint shipping without staged safeguards.
- Ad-hoc operator deletion bypassing deterministic candidate checks.
- “Best effort” manual scripts that skip audit logging or guardrails.

## 8) Automated cleanup boundaries (frozen)

### 8.1 Allowed in future automated cleanup slices (only after manual controls are proven)
- Scheduled non-destructive candidate reporting.
- Scheduled dry-run generation with explicit approval requirement.
- Controlled automation that can be halted immediately and leaves audit trail for every run.

### 8.2 Hard preconditions for any destructive automation
- Manual path exists first and is validated operationally.
- Deterministic guardrails and fail-closed checks are already enforced in code.
- Explicit circuit-breaker/kill-switch exists and is tested.
- Deletion budget/rate limits exist to constrain blast radius.

### 8.3 Not allowed now
- Unattended hard-delete automation.
- Automatic deletion as side effect of product media writes.
- Cleanup jobs that continue execution when observability/audit dependencies are degraded.

## 9) Explicitly forbidden until future dedicated slices

Without a dedicated follow-up policy + implementation freeze, future work must **not**:

1. Hard-delete orphaned/finalized assets immediately on detachment.
2. Delete provider objects based only on stale or cached reference views.
3. Introduce destructive behavior into existing admin media upload/finalize/product media write endpoints.
4. Assume single-product ownership semantics that conflict with allowed cross-product reuse.
5. Run destructive cleanup without deterministic candidate preview and explicit audit trail.
6. Treat missing observability signals as non-blocking warnings.

## 10) Guardrails future runtime/admin tooling must honor

1. **Fail-closed default:** when in doubt, retain asset; never delete on ambiguous state.
2. **Two-phase minimum:** non-destructive candidate/preview phase precedes any destructive phase.
3. **Determinism:** candidate computation, ordering, and guardrail outcomes must be reproducible.
4. **Auditability:** every cleanup decision must be reconstructable from durable logs/records.
5. **Blast-radius control:** bounded batch size, rate limits, and stop controls are mandatory.
6. **Compatibility safety:** no cleanup rule may invalidate still-referenced product media URLs.
7. **Policy/version governance:** destructive behavior changes require new explicit freeze versions.

## 11) Explicitly out of scope for EPIC-5.2R

- Any runtime cleanup implementation (manual or automated).
- New API routes.
- Schema changes.
- Repository/route/provider behavior changes.
- Validation changes.
- Test changes.
- UI changes.

## 12) Recommended next-step sequence after this freeze

1. **Readiness instrumentation slice (read-only):** ensure candidate, skip-reason, and audit observability primitives are available.
2. **Manual dry-run slice:** implement deterministic non-destructive manual candidate simulation with full audit metadata.
3. **Manual staged cleanup slice:** add gated, small-batch, explicitly approved cleanup path (prefer quarantine/soft stage first).
4. **Automation safety slice:** add kill-switches, budgets, and strict dependency health gating.
5. **Automated cleanup slice (optional):** only after prior slices prove safe in production-like operation.

## 13) Final freeze summary

- Cleanup is **not implementation-ready by default**; readiness is gated by strict prerequisites.
- Observability and auditability are mandatory before any destructive behavior is allowed.
- Manual cleanup must be explicit, deterministic, and fail-closed.
- Automated destructive cleanup is deferred until manual controls and safety mechanisms are proven.
- Until dedicated future slices, retention-first behavior remains the required safety posture.
