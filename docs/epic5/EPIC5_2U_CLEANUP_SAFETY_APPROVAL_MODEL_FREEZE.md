# EPIC-5.2U Cleanup Safety / Approval Model Contract Freeze

- Version: V1
- Frozen on (UTC): 2026-03-30
- Type: docs-only governance/contract freeze
- Change policy: immutable for EPIC-5.2U; any change requires a new versioned follow-up freeze.

## 1) Objective

Freeze the safety and approval governance model that must constrain any future cleanup execution phase.

This slice is governance-only. It introduces no runtime behavior, no execution path, no deletion behavior, no soft-delete behavior, no schema changes, and no implementation changes.

## 2) CURRENT STATE ALIGNMENT

1. EPIC-5.2R remains the guardrail baseline (retention-first, fail-closed).
2. EPIC-5.2S already freezes candidate visibility expectations.
3. EPIC-5.2T already freezes dry-run contract constraints.
4. Only dry-run/non-destructive posture exists today.

This 2U slice does not redefine visibility (2S) and does not define output structure (deferred).

## 3) FROZEN SCOPE AND NON-GOALS

### 3.1 In scope

2U defines only:
- safety principles for future cleanup approval/execution governance,
- approval authority model and separation rules,
- preconditions and invalidation rules that must gate any future execution attempt.

### 3.2 Explicit non-goals

2U does **not** define:
- visibility contract details (owned by 2S),
- output completeness contract,
- audit logging implementation mechanics,
- execution mechanics or implementation behavior,
- API, DB, UI, event, or payload schema details.

## 4) FROZEN SAFETY PRINCIPLES

Any future cleanup execution model must enforce all principles below:

1. **Fail-closed default** — when required safety conditions are not fully met, do not execute.
2. **No implicit deletion** — cleanup must never occur as an automatic side effect.
3. **No background execution by default** — execution cannot run unattended without explicit approved governance in a later slice.
4. **No operator action without approval** — execution requires explicit valid approvals.
5. **Determinism required** — approval and execution decisions must be based on deterministic inputs.
6. **Traceability required** — decisions must be reconstructable from durable governance records.
7. **Reversibility preferred before irreversible actions** — staged/reversible approaches are preferred before any irreversible phase.

## 5) FROZEN APPROVAL MODEL (CONTRACT LEVEL ONLY)

### 5.1 Required roles

Any future non-dry-run cleanup execution phase must require, at minimum:
- **Authorized admin operator** (requesting operator),
- **Approving admin** (primary approver),
- **Second approver** (mandatory in production environments).

### 5.2 Separation of duties and dual control

1. Requesting operator must not self-approve.
2. Approving admin must be distinct from requesting operator.
3. In production, dual control is mandatory (primary + second approver both required).
4. Non-production environments may have reduced controls only if explicitly defined by a later freeze.

### 5.3 Approval validity and binding

1. Approval must be time-bounded (explicit expiry required).
2. Approval must bind to a specific approved dry-run snapshot.
3. Approval is valid only for the approved environment and approved execution mode.
4. Any policy/rule/snapshot drift invalidates approval automatically.

No implementation or storage mechanism is defined in 2U.

## 6) PRECONDITIONS BEFORE ANY FUTURE EXECUTION ATTEMPT

Execution must be blocked unless all preconditions are true:

1. An approved snapshot exists.
2. The approved snapshot is immutable for approval purposes.
3. Candidate set was reviewed against the approved snapshot.
4. Protected assets are excluded.
5. Referenced assets are excluded.
6. Approval is still valid and unexpired.
7. Target environment is explicitly confirmed.
8. Execution mode is explicitly chosen and approved.
9. Required audit capability is available.
10. Idempotency guard is defined for the run.
11. Abort/stop conditions are defined before execution begins.

## 7) SNAPSHOT BINDING AND DRIFT INVALIDATION (ANTI-DRIFT)

Execution must be blocked and approval treated as invalid if any of the following changes after approval:

1. Candidate set composition changes.
2. Asset state relevant to candidacy/protection changes.
3. Reference state changes.
4. Governing policy version changes.
5. Governing rule interpretation/constraints change.
6. Approval expires.
7. Approved environment context changes.

No override-by-default path is allowed.

## 8) EXECUTION MODES — POLICY POSITIONING ONLY

Conceptual modes in EPIC-5 cleanup lineage:

1. **Dry-run** (existing, non-destructive).
2. **Quarantine** (future, not authorized by this slice).
3. **Destructive execution** (future, not authorized by this slice).

Only dry-run exists today. Any non-dry-run mode requires separate dedicated freezes before implementation.

## 9) PROTECTED CATEGORIES (MUST REMAIN EXCLUDED)

Any future execution model must exclude at least:

1. Still-referenced assets.
2. Assets currently under review/hold.
3. Ambiguous or insufficiently supported assets.
4. Assets outside the approved snapshot scope.
5. Assets protected by active policy constraints.

## 10) OPERATOR EVIDENCE REQUIREMENTS (HIGH LEVEL, NO SCHEMA)

Before any future execution attempt, governance evidence must include, at minimum:

1. Snapshot identifier.
2. Candidate counts.
3. Candidate/exclusion rationale at abstract reason level.
4. Exclusion coverage summary.
5. Approval metadata (request + approvals).
6. Environment metadata.
7. Governing policy/version reference.
8. Execution intent statement.

2U defines requirement categories only; it does not define fields or JSON structures.

## 11) AUDITABILITY REQUIREMENTS (CONTRACT LEVEL)

Governance must require durable traceability for:

1. Who requested action.
2. Who approved action.
3. When approvals/actions occurred.
4. Which snapshot was approved.
5. Which policy/version governed the decision.
6. Which environment was targeted.
7. Which execution mode was authorized.
8. High-level result summary.

Implementation/storage details are explicitly deferred.

## 12) FAILURE HANDLING — STRICT FAIL-CLOSED

Execution must not proceed when any of the following exists:

1. Invalid approval.
2. Expired approval.
3. Stale or changed snapshot.
4. Drift against approved basis.
5. Missing required audit capability.
6. Missing idempotency guard.
7. Environment/mode/approval mismatch.
8. Partial-execution risk not bounded by predefined abort controls.

No permissive fallback is allowed.

## 13) MANDATORY FUTURE GATE ORDER

Required order before any destructive cleanup implementation:

1. **2U** — safety/approval governance freeze (this slice).
2. **Output completeness freeze**.
3. **Audit logging freeze**.
4. **Quarantine policy freeze** (if adopted).
5. **Destructive execution freeze**.

Order is mandatory and must be enforced by follow-up planning/governance.

## 14) Acceptance Checklist (Binary)

Mark PASS only when every item is true; otherwise FAIL.

- [ ] PASS / FAIL: 2U remains docs-only governance with no runtime behavior.
- [ ] PASS / FAIL: 2U does not redefine 2S visibility or 2T dry-run output constraints.
- [ ] PASS / FAIL: Roles, SoD, dual control (production), approval expiry, and snapshot binding are explicitly frozen.
- [ ] PASS / FAIL: Preconditions and anti-drift invalidation rules explicitly block unsafe execution.
- [ ] PASS / FAIL: Protected categories and fail-closed failure handling are explicit.
- [ ] PASS / FAIL: 2U introduces no schema/API/UI/event/output-structure implementation detail.
- [ ] PASS / FAIL: Mandatory future-gate order is explicit and preserved.
