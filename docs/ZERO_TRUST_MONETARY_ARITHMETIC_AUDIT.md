# Zero-Trust Static Audit: Monetary Arithmetic Containment

Scope: first-party repository code (`src/`, `scripts/`, `_tests_/`) with vendored/generated directories excluded (`node_modules/`, `coverage/`).

## Scan commands executed

1. `rg -n --glob '!node_modules/**' --glob '!coverage/**' --glob '!docs/**' "toFixed\s*\(" src scripts _tests_`
2. `rg -n --glob '!node_modules/**' --glob '!coverage/**' --glob '!docs/**' "(\*|/)\s*10+\b|10\s*(\*|/)\s*|10n\s*\*|\*\*\s*BigInt\(|10n\s*\*\*|pow\(10|1e\d" src scripts _tests_`
3. `rg -n --glob '!node_modules/**' --glob '!coverage/**' "Math\." src scripts`
4. `rg -n --glob '!node_modules/**' --glob '!coverage/**' "reduce\(" src scripts`
5. `rg -n --glob '!node_modules/**' --glob '!coverage/**' "(price|amount|total|unitPrice|totalAmount|minor).{0,30}(\+|\-|\*|/|\+=|-=|\*=|/=)" src scripts`
6. `rg -n --glob '!node_modules/**' --glob '!coverage/**' "currency\b.*(===|!==|includes\(|has\(|\?|switch|case|SUPPORTED_CURRENCIES|normalizeCurrency)" src scripts`
7. `node scripts/scan-float-usage.js`

## Findings (evidence only)

### A) Monetary arithmetic operators

1. `src/utils/minor-units.js:47` — `BigInt(whole) * (10n ** BigInt(exponent))`.
   - Status: **SAFE**.
   - Why: inside centralized conversion primitive `toMinorUnits`; this is the canonical decimal→minor conversion path.

2. `src/utils/minor-units.js:49` — `minor += BigInt(kept)`.
   - Status: **SAFE**.
   - Why: still inside `toMinorUnits`, adding normalized fractional digits after decimal parsing.

3. `src/utils/minor-units.js:53` — `minor += 1n`.
   - Status: **SAFE**.
   - Why: deterministic rounding in centralized converter, not distributed business logic.

4. `src/utils/minor-units.js:81` — `padStart(exponent + 1, '0')`.
   - Status: **SAFE**.
   - Why: string formatting helper in centralized `fromMinorUnits` converter.

### B) Powers-of-10 multiplication/division

1. `src/utils/minor-units.js:47` — uses `10n ** BigInt(exponent)`.
   - Status: **SAFE**.
   - Why: only occurrence in first-party runtime code; implemented in centralized module.

No inline `/100` or `*100` monetary conversion was found in `src/` (`node scripts/scan-float-usage.js` passed all checks).

### C) Reducers aggregating monetary values

1. `src/utils/minor-units.js:115-119` — `sumMinorUnits(values).reduce(...)`.
   - Status: **SAFE**.
   - Why: centralized summation helper with `assertMinorUnitInteger` validation for accumulator and line values.

2. `src/utils/minor-units.js:146-150` — `sumMinorUnitsBigInt(values).reduce(...)`.
   - Status: **SAFE**.
   - Why: centralized bigint summation helper with `assertMinorUnitBigInt` guards.

### D) Currency branching

1. `src/routes/payments.routes.js:24-27` — validate request currency against `SUPPORTED_CURRENCIES`.
   - Status: **SAFE**.
   - Why: gate/validation only; no arithmetic. Arithmetic later uses minor-unit helpers (`toMinorUnits`, `multiplyMinorUnits`, `sumMinorUnits`).

2. `src/routes/webhooks.routes.js:181-191` — stripe currency mismatch check.
   - Status: **SAFE**.
   - Why: integrity comparison only; amount conversion uses `toMinorUnits` before comparison.

3. `src/routes/webhooks.routes.js:309-319` — paypal currency mismatch check.
   - Status: **SAFE**.
   - Why: integrity comparison only; captured amount is converted through `toMinorUnits`.

### E) `Math.*` usage (full scan result in first-party code)

All `Math.*` occurrences in `src/` and `scripts/` are for non-monetary concerns (rate limiting timing, retry backoff, token/random helpers, quantity normalization). No `Math.*` monetary arithmetic found outside `src/utils/minor-units.js`.

### F) `toFixed`

No `toFixed(` usage found in first-party runtime/test code under scan scope.

### G) Implicit numeric coercion for monetary values

No `Number(amount...)`, `parseFloat(...)`, inline `/100`, or `*100` monetary conversion patterns found in `src/` via `scripts/scan-float-usage.js`.

## Containment proof summary

- All monetary arithmetic (conversion, multiplication, summation, rounding) is implemented in `src/utils/minor-units.js`.
- All business-flow callers (`src/routes/payments.routes.js`, `src/repositories/order.repository.js`, `src/routes/webhooks.routes.js`, and `scripts/import-json-to-db.js`) invoke minor-unit helpers rather than performing direct price/amount arithmetic.
- No unsafe finding identified in current scan.

## Corrective patch requirement

No unsafe finding => **no corrective patch required**.