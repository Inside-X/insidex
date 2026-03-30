# EPIC-5.2S Cleanup Dry-Run Candidate Visibility Freeze

- Version: V1
- Frozen on (UTC): 2026-03-30
- Type: docs-only contract/policy freeze
- Change policy: immutable for EPIC-5.2S; any change requires a new versioned follow-up freeze.

## 1) Objective

Freeze the minimum visibility contract for cleanup dry-run candidate review in EPIC-5.

This slice is visibility-only. It defines what must be visible for operator review of dry-run candidate sets and exclusions. It does not authorize mutation, deletion, quarantine, soft-delete, or execution.

## 2) CURRENT STATE

1. EPIC-5.2R freezes retention-first guardrails and requires non-destructive posture before any cleanup execution path.
2. EPIC-5.2T freezes dry-run contract constraints and maintains strict non-destructive behavior.
3. Cleanup remains non-destructive in current posture.
4. The unresolved gap addressed by 2S is explicit candidate/exclusion visibility expectations for safe review.

## 3) FROZEN POLICY — Scope and Non-Goals

### 3.1 In scope

EPIC-5.2S freezes only the candidate visibility contract for dry-run review, including:
- candidate identification visibility,
- candidate rationale visibility,
- review-relevant state visibility,
- exclusion visibility where applicable,
- minimum determinism/reviewability requirements.

### 3.2 Out of scope (explicit non-goals)

EPIC-5.2S does **not** define or authorize:
- mutation, deletion, quarantine, soft-delete, or cleanup execution,
- approval workflow roles, expiry, or gate mechanics,
- full operator evidence-pack completeness,
- audit logging implementation design,
- endpoint shape, JSON schema, DB fields, UI screens, or event names.

## 4) FROZEN POLICY — Candidate Visibility Contract

For each dry-run evaluation set, visibility must be sufficient for a human operator to determine whether inclusion/exclusion is policy-consistent before any future approval or execution slice.

At minimum, visibility must cover the following categories:

1. **Candidate identification**
   - Which assets are currently classified as cleanup candidates.
   - Stable identity/context needed to distinguish each candidate from others in the same set.

2. **Reason for candidacy**
   - Why each included asset is classified as a candidate under active cleanup policy.
   - Reasoning must be explicit, not implied.

3. **Review-relevant state**
   - The committed-state signals required to evaluate candidate safety and policy alignment.
   - Signals must be sufficient for human review; missing required support must be surfaced, not hidden.

4. **Exclusion visibility**
   - Which evaluated assets are excluded from candidacy where applicable.
   - Why each excluded asset is excluded.

5. **Pre-approval context sufficiency**
   - Visibility must be enough to support operator review before any future approval/execution slice.
   - This requirement does not freeze full output-completeness packaging.

## 5) FROZEN POLICY — Inclusion and Exclusion Visibility Rules

1. Dry-run visibility must make explicit which assets are in-candidate-set and why.
2. Dry-run visibility must make explicit which assets are out-of-candidate-set (where evaluated) and why.
3. Inclusion and exclusion reasoning must be policy-mappable and reviewable.
4. Ambiguous classification must not be silently presented as candidate-ready.

## 6) FROZEN POLICY — Determinism and Reviewability

1. Candidate/exclusion visibility must be deterministic enough that the same underlying committed state yields the same reviewable classification set.
2. Visibility must support operator review prior to any future approval gate.
3. When required support is missing or ambiguous, the result must remain visibly unresolved (not silently elevated into candidate status).

## 7) FROZEN POLICY — Safety Boundaries

1. Visibility generation must not mutate state.
2. Visibility must not suppress protected categories from review.
3. Visibility must not silently include still-referenced assets as executable cleanup targets.
4. Visibility remains subordinate to EPIC-5.2R guardrails and future approval gates.

## 8) FUTURE-NOT-YET-IMPLEMENTED Boundaries

1. **EPIC-5.2S**: visibility-only candidate/exclusion contract.
2. **EPIC-5.2T**: dry-run contract constraints for non-destructive operation.
3. **EPIC-5.2U**: safety/approval model (deferred; not specified here).
4. **Later slices**: output completeness, audit logging implementation, quarantine/soft-delete policy (if adopted), and only then any destructive execution design.

This section positions scope boundaries only and does not rewrite prior freezes.

## 9) Acceptance Checklist (Binary)

Mark PASS only if every item is true; otherwise FAIL.

- [ ] PASS / FAIL: 2S remains docs-only and visibility-only.
- [ ] PASS / FAIL: No mutation/deletion/quarantine/soft-delete/execution behavior is authorized.
- [ ] PASS / FAIL: Inclusion and exclusion visibility requirements are explicit and reviewable.
- [ ] PASS / FAIL: Determinism/reviewability and ambiguity handling are explicitly constrained.
- [ ] PASS / FAIL: 2S does not define approval workflow, output completeness, or audit logging implementation.
- [ ] PASS / FAIL: 2S is explicitly bounded under 2R guardrails, aligned with 2T, and does not overtake 2U scope.
