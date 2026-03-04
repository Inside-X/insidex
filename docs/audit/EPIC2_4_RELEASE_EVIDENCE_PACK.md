# EPIC-2.4.4 Release Evidence Pack (ALL GREEN)

## Purpose
This document packages the minimum evidence required to approve **GO(prod payments)**.

**This pack is SRE-grade: deterministic, fail-closed, anti-butterfly.**

## Scope and pinned identifiers
- Current repo branch: `work`
- Current repo HEAD SHA: `b29e35628d9ef6ce3116858be9cd8a32dc807fbf`
- Audited payments GO SHA (from browser proof): `6bc33823fe8a18e4e7722a5ece1d076f3fb004b0`

### Strict invariant
- **GO(prod payments) applies only to the audited SHA referenced by browser proof.**
- If current HEAD SHA differs from audited SHA, production payments approval must be treated as **not transferable** until a new proof is produced for the target SHA.

## Mandatory gates evidence (repeatable)
Run the following commands and require exit code `0`:
- `npm test -- --runInBand`
- `npm run test:coverage:ci`
- `npm run test:chaos`

Strict rule: **any failing gate => GO(prod)=NO**.

## Browser E2E evidence
Reference points:
- `playwright.config.cjs`
- `tests/e2e-browser/checkout.create-intent.retry.spec.js`
- CI job: `e2e_browser` (gated by `vars.CI_GATING_PROFILE == "prod-payments"`)

Proof artifact:
- `docs/audit/artifacts/e2e_browser_proof.6bc33823.json`

Evidence statement:
- Proof `result=pass` for `sha=6bc33823fe8a18e4e7722a5ece1d076f3fb004b0` at `2026-03-04T10:01:02Z`.

## Operational readiness pointers
- Payments kill-switch / maintenance behavior (`payments_disabled`) documentation:
  - `docs/ops/runbooks/payments_incidents.md`
  - `docs/ops/payments.md`
- Incident runbook:
  - `docs/ops/runbooks/payments_incidents.md`
- Deploy checklist:
  - `docs/ops/runbooks/deploy_checklist.md`
- Backup/restore drill:
  - `docs/ops/runbooks/backup_restore_drill.md`

## Release decision matrix
- **GO(dev): YES** if mandatory gates pass.
- **GO(prod payments): YES only if all are true:**
  1. Mandatory gates PASS (`test`, `coverage`, `chaos`).
  2. Browser E2E proof is PASS for the audited SHA.
  3. Runbooks present.
  4. Deploy checklist present.
  5. Backup/restore drill present.