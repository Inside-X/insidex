# EPIC-2.4.4 Release Evidence Pack (ALL GREEN)

## Purpose
This document packages the minimum evidence required to approve **GO(prod payments)**.

**This pack is SRE-grade: deterministic, fail-closed, anti-butterfly.**

## Baseline snapshot
- Audited runtime SHA (pinned): `6bc33823fe8a18e4e7722a5ece1d076f3fb004b0`
- Current HEAD at pack generation: `e91be1667a2abcf42bdacdc77bdd66b94cad2d7a`
- Current repo branch (informational only): `work`

### SHA pinning invariants (non-negotiable)
- audited_runtime_sha: `6bc33823fe8a18e4e7722a5ece1d076f3fb004b0`
- pack_generated_sha: `e91be1667a2abcf42bdacdc77bdd66b94cad2d7a`
- Rule: GO(prod payments)=YES is valid ONLY for audited_runtime_sha with matching e2e_browser_proof artifact for that SHA.
- If audited_runtime_sha != pack_generated_sha, clarify: “This pack update is docs-only; it does not change runtime behavior.”
- STOP CONDITION: If any mandatory gate fails OR if proof for audited_runtime_sha is missing => GO(prod)=NO.

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

### CI run reference (recommended)
- ci_run_url: `<TBD>`
- artifact_name: `e2e_browser_proof`
- retention_days: `14`
- Note: CI run URL is optional convenience; the hard requirement remains the in-repo proof JSON pinned to audited_runtime_sha.

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