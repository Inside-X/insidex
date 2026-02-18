# VAGUE 1 — Float/Minor Units Scan Report

## Scope
- Source scanned: `src/**` (excluding `node_modules`, `coverage`, tests and scripts for signal quality).
- Forbidden patterns scanned:
  - `parseFloat(...)`
  - `Number(...amount...)`
  - inline `/100`
  - inline `*100`

## Before hardening pass
- `parseFloat(...)`: **0 finding**
- `Number(...amount...)`: **0 finding**
- inline `/100`: **0 finding**
- inline `*100`: **0 finding**

## After hardening pass
- `parseFloat(...)`: **0 finding**
- `Number(...amount...)`: **0 finding**
- inline `/100`: **0 finding**
- inline `*100`: **0 finding**

## Enforcement
- CI/local command: `npm run scan:floats`
- Any finding exits non-zero and blocks the pipeline.