# EPIC-5.2T Cleanup Dry-Run Execution Contract Freeze

- Version: V1
- Frozen on (UTC): 2026-03-27
- Type: docs-only contract/policy freeze
- Change policy: immutable for EPIC-5.2T; any change requires a new versioned follow-up freeze.

## 1) Objective

Freeze a conservative, operator-safe contract for a **future** cleanup dry-run operation for finalized uploaded assets.

This slice defines what a future dry-run is allowed to accept and required to return, while explicitly forbidding destructive behavior.

This slice is docs-only and introduces no runtime behavior, no schema changes, no repository changes, no route changes, no provider changes, no test changes, and no UI changes.

## 2) Sources of truth compared in this freeze

Primary comparison set:
- `docs/epic5/EPIC5_2G_ADMIN_MEDIA_UPLOAD_CONTRACT_FREEZE.md`
- `docs/epic5/EPIC5_2M_FINALIZED_ASSET_LIFECYCLE_FREEZE.md`
- `docs/epic5/EPIC5_2O_ORPHAN_ASSET_OPERATIONAL_POLICY_FREEZE.md`
- `docs/epic5/EPIC5_2R_CLEANUP_PREPARATION_GUARDRAILS_FREEZE.md`
- `prisma/schema.prisma`
- `src/routes/admin-media.routes.js`
- `src/repositories/media-upload.repository.js`

## 3) Current observed runtime/persistence reality (frozen baseline)

1. Runtime currently exposes read-only listing surfaces for finalized assets, orphaned assets, and cleanup dry-run candidates.
2. Current candidate visibility is non-destructive and uses orphan/unreferenced state as the candidate basis.
3. Product media references are independent from uploaded assets and are linked by URL semantics.
4. There is currently no runtime cleanup execution endpoint, no deletion workflow, and no mutation path tied to dry-run visibility.
5. Existing policy freezes require retention-first behavior and fail-closed safety posture.

This baseline is descriptive only and does not authorize implementation in this slice.

## 4) Future dry-run purpose (frozen)

A future cleanup dry-run must provide a deterministic, non-destructive preview of what **would** be eligible for cleanup under explicit guardrails at a specific evaluation time.

Dry-run exists to support operator safety and decision quality, not to perform cleanup.

## 5) Allowed future dry-run inputs (minimal and conservative)

Until a dedicated implementation slice is approved, the future dry-run input contract is frozen to a minimal, restrictive set:

1. `reasonCodes` (optional)
   - Purpose: constrain preview to explicitly supported candidate-reason classes.
   - Initial allowed value set (frozen):
     - `ORPHANED_UNREFERENCED_ASSET`
   - Unknown values must fail validation.

2. `limit` (optional)
   - Purpose: cap number of returned candidate/exclusion rows for safe operator review.
   - Must be positive integer and bounded by a strict server-side maximum.
   - Server-side default must be deterministic.

3. `cursor` (optional)
   - Purpose: deterministic pagination over a stable ordered candidate universe.
   - Must be opaque; clients must not infer internal ordering keys.

4. `asOf` (optional, future-safe, non-authoritative)
   - Purpose: annotate requested evaluation timestamp.
   - Server may ignore if unsafe/unimplemented.
   - If ignored, response must explicitly report effective evaluation timestamp used.

### Inputs explicitly deferred (not frozen as allowed)

The following are intentionally deferred to avoid unsafe ambiguity:
- direct deletion scopes,
- product-scoped cleanup filters,
- provider-object-state filters,
- “force” flags,
- risk-threshold override flags,
- include/exclude by raw URL wildcard.

## 6) Required future dry-run output contract sections

A future dry-run response must include all sections below. Omission of any required section is contract violation.

1. `meta`
2. `summary`
3. `candidates`
4. `excluded`
5. `warnings`
6. `blockers`

The operation is still a dry-run regardless of warnings/blockers; however, blockers must clearly indicate execution prohibition conditions for future destructive phases.

## 7) Minimum required fields per section

## 7.1 `meta` (required)

Must include:
- `dryRun`: boolean, must be `true`.
- `evaluationTimestamp`: ISO-8601 UTC timestamp actually used for evaluation.
- `requestId`: correlation identifier.
- `policyVersion`: freeze/version identifier used by evaluator (e.g., `EPIC-5.2T/V1`).
- `inputEcho`: normalized, validated input values actually applied.
- `ordering`: explicit stable ordering statement used for candidates/exclusions.

## 7.2 `summary` (required)

Must include at minimum:
- `totalEvaluatedAssets`
- `totalCandidateAssets`
- `totalExcludedAssets`
- `totalWarnings`
- `totalBlockers`
- `candidateReasonCounts` (map keyed by reason code)
- `exclusionReasonCounts` (map keyed by reason code)

Constraint:
- `totalEvaluatedAssets = totalCandidateAssets + totalExcludedAssets` must hold.

## 7.3 `candidates` (required array)

Each candidate item must include at minimum:
- `assetId`
- `uploadId`
- `url`
- `mimeType`
- `sizeBytes`
- `checksumSha256`
- `assetCreatedAt`
- `isReferenced` (must be `false` for current known reason class)
- `referenceCount` (must be `0` for current known reason class)
- `candidateReason` (enum; currently must support `ORPHANED_UNREFERENCED_ASSET`)
- `guardrailChecks` (object with explicit pass/fail/unknown per check)
- `riskFlags` (array; empty if none)
- `explanation` (human-readable concise rationale)

## 7.4 `excluded` (required array)

Each excluded item must include at minimum:
- `assetId`
- `uploadId` (nullable if not resolvable)
- `url`
- `isReferenced`
- `referenceCount`
- `exclusionReason` (required enum/string code)
- `exclusionDetail` (human-readable concise explanation)
- `guardrailChecks` (object with explicit pass/fail/unknown per check)

Minimum exclusion reason coverage that must be representable:
- `STILL_REFERENCED`
- `INVALID_STATE`
- `MISSING_REQUIRED_METADATA`
- `REASON_CODE_FILTER_MISMATCH`
- `OUTSIDE_REQUEST_WINDOW`
- `INTERNAL_EVALUATION_ERROR`

Note: reasons may be expanded in future versions, but these must remain representable.

## 7.5 `warnings` (required array)

Each warning item must include:
- `code`
- `message`
- `scope` (`global` or item-scoped identifier)
- `impact` (what confidence/safety aspect is reduced)

Warnings are non-fatal but must never be silently suppressed.

## 7.6 `blockers` (required array)

Each blocker item must include:
- `code`
- `message`
- `scope`
- `requiredAction`

Blockers represent conditions that must prevent any future destructive execution attempt until resolved.

## 8) Operator-visible safety checks that must be surfaced

Dry-run output must explicitly surface per-run and per-item safety checks, including at least:

1. Reference-state check
   - Evaluated against committed current state.
   - Must show exact observed `referenceCount`.

2. Determinism check
   - Candidate ordering/pagination consistency must be verifiable.

3. Data completeness check
   - Required metadata fields present and parseable.

4. Policy conformance check
   - Candidate/exclusion decision mapped to explicit policy reason code.

5. Observability integrity check
   - Required audit/correlation identifiers produced.

If any required check cannot be confidently evaluated, result must be `unknown` and surfaced as warning or blocker (not hidden).

## 9) Candidate and exclusion reason explicitness rules

1. Every evaluated asset must appear in exactly one of `candidates` or `excluded`.
2. Every candidate must have exactly one primary `candidateReason`.
3. Every excluded item must have exactly one primary `exclusionReason`.
4. Reason codes must be machine-stable and human-documented.
5. Free-text without reason code is forbidden.

## 10) Forbidden behavior at dry-run stage

Non-negotiable forbiddance for future dry-run execution stage:

1. No deletion of database rows.
2. No deletion of provider objects.
3. No mutation of upload session/finalized asset records.
4. No mutation of product media references.
5. No state transitions to deleted/quarantined/soft-deleted states.
6. No implicit cleanup side effects in read-only dry-run endpoints/tools.
7. No “best effort” silent partial mutation.

Dry-run must be strictly non-destructive.

## 11) Explicit non-goals for this contract freeze

This freeze does not define:
- a destructive cleanup execution contract,
- approval workflow UX,
- scheduler automation semantics,
- batch delete budgets/rate limits implementation,
- schema migration plans,
- provider-specific deletion mechanics.

These are deferred to dedicated follow-up slices.

## 12) Recommended next-step sequence after this freeze

1. **Implementation slice (non-destructive only):** implement dry-run endpoint/tool strictly matching this contract.
2. **Validation slice:** add deterministic contract tests for reason-code coverage, summary invariants, and safety-check visibility.
3. **Operator controls slice:** define explicit approval/acknowledgement model for any future destructive phase.
4. **Staged cleanup policy slice:** freeze quarantine/soft-delete and rollback strategy before hard delete is even considered.
5. **Destructive execution slice (optional):** only after all above slices are complete and proven.

## 13) Final freeze summary

- Future cleanup dry-run is frozen as a deterministic, non-destructive preview operation.
- Inputs are intentionally minimal and restrictive.
- Outputs must include explicit candidates, exclusions, reasons, summary metrics, warnings, and blockers.
- Operator-visible safety checks are mandatory and cannot be hidden.
- Any destructive behavior remains forbidden at dry-run stage and deferred to later dedicated freezes.
