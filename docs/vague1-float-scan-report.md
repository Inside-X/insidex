# Float & amount arithmetic scan report (VAGUE 1)

## Scope
Repository-wide scan for forbidden monetary patterns:
- `parseFloat`
- `Number(` used on amount conversions
- inline `/100` and `*100` for monetary conversion

## Before hardening
Historical findings were concentrated in `src/utils/minor-units.js`.

## After hardening
Command executed:

```bash
rg -n "parseFloat|Number\([^)]*amount|/\s*100|\*\s*100" src
```

Output:

- `src/routes/auth.routes.js:31` (cookie maxAge constant, non-financial)
- `src/middlewares/rateLimit.js:81` (seconds conversion for header, non-financial)
- `src/lib/stripe.js:31` (timestamp conversion, non-financial)
- `src/lib/webhook-idempotency-store.js:26` (TTL conversion, non-financial)

No remaining inline float conversion for payment amount handling was detected.