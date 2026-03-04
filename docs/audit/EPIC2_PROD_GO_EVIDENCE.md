# EPIC-2 Prod Payments GO Evidence

For **GO(prod payments)**, CI evidence is mandatory on the exact audited commit SHA.

Required artifact:
- `e2e_browser_proof`

The artifact must contain `e2e_browser_proof.json` with commit-scoped metadata (`repo`, `branch`, `sha`, `workflow`, `job`, `timestamp_utc`, `command`, `result`) proving `npm run test:e2e:browser` passed for that commit.