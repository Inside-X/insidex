# Monetary Arithmetic Static Audit (Zero-Trust)

## Scope
Repository-wide static scan (excluding generated/vendor directories):
- `src/**`
- `scripts/**`
- `_tests_/**`
- root client scripts (`script.js`, `app.js`)
- `prisma/**`

## Scan commands executed
- `rg -n --glob '!node_modules/**' --glob '!coverage/**' --glob '!.git/**' "\bMath\.|toFixed\(|\b(price|amount|total|subtotal|tax|discount|shipping)\b\s*[-+*/]|[-+*/]\s*\b(price|amount|total|subtotal|tax|discount|shipping)\b|10\s*\*\*|\*\s*10+|/\s*10+|\bNumber\(|\bparseFloat\(|\bparseInt\(|\+\s*[A-Za-z_$][\w$]*|reduce\(|currency\s*===|currency\s*!==|switch\s*\(\s*currency" src scripts prisma _tests_ *.js`
- `rg -n --glob '!node_modules/**' --glob '!coverage/**' --glob '!.git/**' "(price|amount|total|subtotal|tax|discount|shipping)[A-Za-z_]*\s*[+\-*/]" src scripts app.js script.js prisma`
- `rg -n --glob '!node_modules/**' --glob '!coverage/**' --glob '!.git/**' "[+\-*/]\s*(price|amount|total|subtotal|tax|discount|shipping)\b" src scripts app.js script.js prisma`
- `rg -n --glob '!node_modules/**' --glob '!coverage/**' --glob '!.git/**' "reduce\([^\n]*(price|amount|total|minor|unitPrice|dbUnitPrice)" src scripts app.js script.js`
- `rg -n --glob '!node_modules/**' --glob '!coverage/**' --glob '!.git/**' "toFixed\(|/\s*100\b|\*\s*100\b|10\s*\*\*|1_?0{2,}" src scripts app.js script.js prisma`
- `rg -n --glob '!node_modules/**' --glob '!coverage/**' --glob '!.git/**' "currency|CURRENCY|SUPPORTED_CURRENCIES|switch\s*\(\s*.*currency|===\s*'USD'|===\s*\"USD\"|===\s*'EUR'|===\s*\"EUR\"" src scripts app.js script.js prisma`

## Centralized minor-units module proof point
- `src/utils/minor-units.js` contains all decimal↔minor conversion logic, including:
  - exponent map per currency,
  - decimal parsing,
  - power-of-10 scaling (`10n ** BigInt(exponent)`),
  - rounding behavior,
  - reverse formatting from minor units.

## Findings

### SAFE (production paths)

1) `src/routes/payments.routes.js:40,47`
- **Pattern hit:** reducer aggregation and arithmetic over order totals.
- **Why safe:** source values are converted with `toMinorUnits(product.price)` first; subsequent arithmetic is integer minor-unit math only (`dbUnitPriceMinor * quantity`, then sum).
- **Proof:** direct import/use of `toMinorUnits` and no decimal arithmetic in this block.

2) `src/repositories/order.repository.js:100-104,186-189`
- **Pattern hit:** reducers aggregating totals and multiplication by quantity.
- **Why safe:** each product price is converted through `toMinorUnits(String(price))` before multiplication/sum; write-path stores `fromMinorUnits(totalAmountMinor)`.
- **Proof:** both conversion functions are imported from centralized module and used in-path.

3) `src/repositories/order.repository.js:39`
- **Pattern hit:** implicit string coercion for amount validation path.
- **Why safe:** `expectedTotalAmount` is normalized to string then parsed only by `toMinorUnits`, not by float math.
- **Proof:** no `Number/parseFloat/toFixed` in this validation path.

4) `src/routes/webhooks.routes.js:168,287,291`
- **Pattern hit:** currency/amount checks.
- **Why safe:** both expected and paid amounts are computed with `toMinorUnits(...)` before equality comparison.
- **Proof:** direct callsites and integer comparison only.

### UNSAFE (outside centralized minor-units)

5) `scripts/import-json-to-db.js:173,179-180,196`
- **Pattern hit:** monetary accumulator and multiplication on `unitPrice` (`totalAmount += unitPrice * quantity`) plus `Number(...)` coercion of prices.
- **Why unsafe:** this script performs monetary arithmetic directly on JS `Number` and persists decimal `totalAmount` without using `toMinorUnits/fromMinorUnits`; vulnerable to floating-point drift and policy bypass.
- **Proof:** no import/use of `src/utils/minor-units.js` in this file; direct arithmetic present.
- **Minimal corrective patch (proposal):**
  - import `{ toMinorUnits, fromMinorUnits }`;
  - compute `unitPriceMinor = toMinorUnits(String(...))`;
  - aggregate `totalAmountMinor += unitPriceMinor * quantity`;
  - persist `totalAmount: fromMinorUnits(totalAmountMinor)`.

6) `_tests_/repositories/order.repositorty.test.js:42,45,240`
- **Pattern hit:** `* 100`, `/ 100`, `toFixed(2)` in mocked conversion helpers.
- **Why unsafe (test-only):** test helpers re-implement currency conversion logic instead of delegating to centralized module, so tests may diverge from runtime behavior.
- **Proof:** explicit arithmetic in mock functions.
- **Minimal corrective patch (proposal):** in test mocks, call real `toMinorUnits/fromMinorUnits` from `src/utils/minor-units.js` instead of hardcoded `*100` logic.

7) `_tests_/routes/payments.routes.test.js:18` and `_tests_/routes/webhooks.routes.test.js:18`
- **Pattern hit:** mocked `toMinorUnits` implemented as `Number(String(x).replace('.', ''))`.
- **Why unsafe (test-only):** bypasses production rounding/validation and currency exponent behavior.
- **Proof:** mock body has inline decimal-stripping arithmetic/coercion.
- **Minimal corrective patch (proposal):** mock should delegate to actual module function or import real implementation.

### Observed but not monetary-arithmetic violations

8) `script.js:20`
- **Pattern hit:** `Number(price)` coercion.
- **Assessment:** not a direct arithmetic operation in this file (price is stored/displayed), but still monetary parsing outside centralized module; medium-risk smell for future regressions.
- **Recommendation:** keep as string in cart storage, convert only server-side via `toMinorUnits`.

## Verdict
Strict proof **fails** for whole-repository policy as written due to one production script (`scripts/import-json-to-db.js`) and several test-local monetary conversions.

For runtime request/payment/order paths under `src/**`, monetary arithmetic is centralized through `src/utils/minor-units.js` and integer minor-unit operations.