# EPIC-6.B5.0 — Admin Stock Adjustment Brainstorming

- Type: Brainstorming (docs-only)
- Status: Draft brainstorming input (not frozen)
- Date (UTC): 2026-04-16
- Canonical scope alignment reference: `main@bf2dd60e03eadc1b654c8561526d53817708fac9` (branch/ref mismatch is warning-only unless lineage is inconsistent)

---

## 1) Scope and Non-Goals

### Scope
This slice is a **docs-only brainstorming document** for bounded manual admin stock adjustments.

### Non-goals (explicit)
- This is **not** a contract freeze.
- This does **not** implement admin stock adjustment behavior.
- This does **not** define final API payloads.
- This does **not** define final DB schema or migrations.
- This does **not** define final UI/admin screen behavior.
- This does **not** redesign broader inventory architecture.
- This does **not** redesign payment/finalization/remediation policy.
- This does **not** define a warehouse-management system.

---

## 2) Problem Statement

The business may require tightly bounded manual stock corrections by authorized admins when authoritative stock-bearing truth is known to be materially incorrect.

The risk is high: manual adjustments can corrupt deterministic stock truth if correction intent is vague or conflated with retry/replay/remediation behavior.

This brainstorming scope exists to prevent later implementation drift where **correction**, **override**, **reconciliation**, **duplicate**, and **new intended action** are treated as interchangeable.

---

## 3) Why This Is Dangerous

Manual admin stock adjustment is intrinsically high-risk because it can:
- Desynchronize stock truth from order/fulfillment truth.
- Bypass runtime guardrails that currently enforce fail-closed behavior.
- Hide operational mistakes behind ad-hoc edits.
- Create replay/duplicate ambiguity under retries or uncertain outcomes.
- Degrade auditability if intention/outcome are not captured distinctly.
- Accidentally establish a second parallel stock authority (including SKU misuse).

---

## 4) Candidate Legitimate Admin Use Cases (Brainstorming Only)

These are candidate bounded use cases; they are **not frozen approvals**:

1. **Physical recount mismatch**
   - Verified physical count differs from authoritative stock record.
2. **Damaged/lost inventory correction**
   - Confirmed shrinkage/spoilage/loss requiring authoritative correction.
3. **Post-migration/import correction**
   - Controlled correction after confirmed import discrepancy.
4. **Bounded operator remediation after confirmed discrepancy**
   - Manual correction where discrepancy is already evidence-backed and classified.
5. **Explicit stock restoration after approved operational reversal boundary**
   - Restoration only when reversal/remediation truth is already authoritative and non-contradictory.

---

## 5) Candidate Illegitimate / Dangerous Use Cases

These should likely be forbidden or tightly constrained in future freezes:

1. Casual stock rewriting without authoritative reason.
2. Compensating for unknown errors before investigation.
3. Editing stock merely to force checkout/order acceptance.
4. Silently undoing order effects without linked authoritative truth.
5. Adjusting stock from fuzzy assumptions (no strong identity/evidence).
6. Using SKU as an alternate stock bucket or secondary quantity authority.

---

## 6) Semantic Distinctions That Must Remain Separate

Later freeze slices must preserve explicit separations:

1. **Correction vs override**
   - Correction = evidence-backed truth repair; override = policy exception.
2. **Reconciliation vs remediation**
   - Reconciliation = aligning records to authoritative truth; remediation = handling unresolved failure territory.
3. **Replay vs duplicate vs new intended adjustment**
   - Replay = safe re-return of known prior outcome; duplicate = repeated same request; new intended adjustment = materially new intent.
4. **Stock truth vs fulfillment truth**
   - Stock quantity authority must not be conflated with order fulfillment state progression.
5. **Product/variant identity vs stock quantity truth**
   - Identity resolution (including SKU lookup) is distinct from stock-bearing quantity authority.
6. **Admin intention vs applied outcome**
   - Requested adjustment intent must be distinguishable from actual persisted effect.
7. **Operational note vs authoritative reason code**
   - Human narrative notes must not substitute for structured authoritative causality.

---

## 7) Concurrency / Idempotency / Replay Risk Map

Critical collision/risk cases for future freeze treatment:

1. **Same admin double-submit**
   - User action or network retry sends near-identical adjustments.
2. **Different admins concurrent on same stock target**
   - Competing writes create lost-update or non-deterministic outcomes.
3. **Admin adjustment collides with live order/finalization movement**
   - Manual write races with authoritative runtime stock decrement/increment paths.
4. **Retry after timeout / uncertain response**
   - Caller cannot determine if prior attempt applied.
5. **Stale admin view vs current authoritative truth**
   - Adjustment based on outdated quantity snapshot.
6. **Partial failure during persistence/audit write**
   - Quantity mutation succeeds but audit trail fails (or inverse), creating forked truth.

This section is a risk map only; it intentionally does not prescribe runtime solutions.

---

## 8) Auditability Requirements (Brainstorm)

Future implementation will likely need authoritative capture of:

- Actor identity (who initiated).
- Timestamp (when requested and when applied/rejected).
- Declared reason (why).
- Exact target identity (what stock-bearing entity).
- Before and after quantities.
- Intention type classification.
- Correlation/evidence reference when applicable.
- Final action result classification (succeeded / failed / rejected / replayed if applicable).

Auditability must preserve intention/outcome separation and reject silent correction.

---

## 9) Boundary with Existing Order/Finalization Truth

Later implementation must **not**:

1. Silently rewrite order truth to match stock edits.
2. Silently resolve payment-valid-but-stock-not-finalizable cases outside frozen B2.1/B2.2/B2.3 boundaries.
3. Function as a hidden refund/reversal/finalization workaround.
4. Bypass existing authoritative stock movement discipline enforced by current runtime paths.

---

## 10) Relationship to SKU / Variant Identity

Explicit boundary:

- SKU remains only a resolver of stock-bearing identity.
- SKU must not become a second stock bucket or alternate quantity authority.
- Any future adjustment operation must target authoritative stock-bearing truth directly, not SKU-as-stock.

---

## 11) Brainstormed Recommendation for Next Freeze

Open a dedicated **contract-freeze** slice for admin stock adjustment intent, idempotency semantics, and concurrency boundaries **before** any API/runtime/schema/UI implementation work begins.

---

## 12) Acceptance Checklist (Binary PASS/FAIL)

- [x] PASS: Docs-only brainstorming; no runtime behavior implemented.
- [x] PASS: Scope/non-goals explicitly prevent API/schema/UI/runtime design.
- [x] PASS: Problem statement and danger model are explicit.
- [x] PASS: Legitimate vs illegitimate use cases are separated and non-frozen.
- [x] PASS: Critical semantic distinctions are explicitly separated.
- [x] PASS: Concurrency/idempotency/replay risks are mapped without premature solutioning.
- [x] PASS: Auditability brainstorm is explicit and bounded.
- [x] PASS: Existing order/finalization boundaries are preserved.
- [x] PASS: SKU identity-only boundary is explicit.
- [x] PASS: Single strict next-step recommendation is present.
