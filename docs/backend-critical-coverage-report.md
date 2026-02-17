# Backend Critical Coverage Report

Generated from `NODE_OPTIONS=--experimental-vm-modules node ./node_modules/jest/bin/jest.js --coverage --runInBand` with current `jest.config.js` critical backend instrumentation.

## Threshold policy configured

- Statements: **>= 95%**
- Branches: **>= 90%**
- Functions: **100%**
- Lines: **>= 95%**

## Current global result (instrumented backend scope)

- Statements: **67.84%**
- Branches: **67.06%**
- Functions: **68.96%**
- Lines: **73.59%**

Status: **FAIL** vs policy thresholds.

## Critical modules with insufficient coverage

| Module | Statements | Branches | Functions | Notes |
|---|---:|---:|---:|---|
| `src/repositories/analytics.repository.js` | 0% | 0% | 0% | No direct test coverage on CRUD delegation. |
| `src/repositories/lead.repository.js` | 0% | 0% | 0% | No direct repository-level tests. |
| `src/repositories/product.repository.js` | 0% | 0% | 0% | No direct repository-level tests. |
| `src/repositories/order.repository.js` | 35.6% | 27.08% | 39.28% | Advanced transactional branches remain under-tested. |
| `src/routes/cart.routes.js` | 55.55% | 100% | 0% | Route handlers partially covered; function-level instrumentation still low. |
| `src/routes/leads.routes.js` | 60% | 100% | 0% | Route handler function coverage incomplete. |
| `src/routes/products.routes.js` | 71.42% | 100% | 33.33% | GET/POST paths insufficiently exercised for function metric. |
| `src/routes/webhooks.routes.js` | 71.79% | 65.21% | 66.66% | Error branches and guard combinations still missing tests. |
| `src/lib/paypal.js` | 75% | 61.11% | 100% | Some failure/edge branches not covered. |
| `src/routes/auth.routes.js` | 78.12% | 64% | 88.88% | Several conflict/misconfig/invalid flows under-covered. |

## Added tests in this change-set

- `tests/repositories/cart-user.repository.test.js`
- `tests/lib/paypal.lib.test.js`
- `tests/lib/db-error.test.js`
- `tests/middlewares/cors.middleware.test.js`

These raise real backend coverage but do not yet satisfy the strict global policy.

## CI/CD impact

- Any pipeline step running coverage with enforced thresholds will fail until missing modules above are covered.
- Regular `jest` (without coverage threshold gate) still passes.
- Recommended CI split:
  1. fast gating: `jest` (all tests)
  2. quality gate: `jest --coverage` with strict thresholds (blocking)

## Next actions to reach policy

1. Add repository suites for `analytics`, `lead`, `product`, and deeper `order` branches.
2. Add explicit route-level tests for all handlers in `cart`, `leads`, `products`, and remaining webhook error branches.
3. Add targeted auth negative-path tests for all branch points in `auth.routes.js`.
4. Keep threshold policy unchanged until metrics reach target.