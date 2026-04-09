# EPIC-6.B4.3 — Fulfillment Naming / State Reconciliation Brainstorming

- Type: Brainstorming checkpoint (docs-only)
- Status: Drafted for B4.3
- Date (UTC): 2026-04-09
- Canonical scope alignment reference: `main@49b2d62d11b4bec25583697559b255f5d8f321a6` (branch/SHA mismatch is warning-only unless lineage is inconsistent)

---

## 1) Scope and Non-Goals

This is a **docs-only brainstorming slice**.

In scope:
- Clarify the naming/state reconciliation problem before runtime fulfillment-state work.
- Structure risks and options for reconciling legacy order terms with local-fulfillment semantics.
- Prepare bounded inputs for a later naming/state contract freeze.

Non-goals (explicit):
- Not a contract freeze yet.
- No runtime behavior changes.
- No schema/API/UI implementation.
- No runtime symbol renaming.
- No final API/schema payload definitions.
- No carrier shipping model.
- No dispatch workflow definition.
- No redesign of B2/B3 business truth.

---

## 2) Problem Statement

Current runtime vocabulary includes legacy lifecycle wording such as `shipped`.

Current local-fulfillment phase semantics are mode-specific (`pickup_local`, `delivery_local`) and explicitly non-carrier.

If readiness/lifecycle naming proceeds without reconciliation first, semantics can collide: one term may incorrectly represent multiple different truths.

---

## 3) Why the Ambiguity Is Dangerous

1. `shipped` can imply carrier-dispatch semantics that do not fit `pickup_local`.
2. `shipped` can still be misleading for `delivery_local` in this phase because local-delivery operations are not equivalent to generic shipping pipelines.
3. Customer-visible wording can become inaccurate (false expectations about where order is and what happens next).
4. Admin/operator reasoning can diverge from customer semantics.
5. Runtime implementation can encode the wrong abstraction and become expensive to unwind.

---

## 4) Semantic Layers That Must Remain Separated

Minimum layers that must not be blurred:
1. Payment truth.
2. Order truth.
3. Fulfillment mode truth (`pickup_local` vs `delivery_local`).
4. Fulfillment readiness/progression truth.
5. Customer-visible communication truth.
6. Operator/admin handling truth.

Where `shipped` crosses layers incorrectly:
- It can collapse order lifecycle and fulfillment progression into one vague label.
- It can leak carrier assumptions into customer-visible communication when carrier shipping is out of scope.
- It can mask mode-specific truth differences between pickup and local delivery.

---

## 5) Inventory of Terminology Conflict

Observed/likely conflict points:

1. **Legacy `shipped`**
   - currently present in order transition vocabulary,
   - semantically broad and potentially carrier-biased.

2. **`ready_for_pickup` (potential future meaning)**
   - indicates handover readiness for customer collection,
   - not equivalent to dispatch or delivery in motion.

3. **`ready_for_local_delivery` (potential future meaning)**
   - indicates readiness for local delivery flow,
   - not equivalent to pickup readiness.

4. **Progression wording distinctions to preserve**
   - prepared,
   - ready,
   - handoff/dispatch started,
   - completed (`collected` / `delivered`).

This slice does not freeze final names yet; it isolates the ambiguity and required distinctions.

---

## 6) Reconciliation Options

### Option A — Keep legacy internal name, map externally
- Keep generic internal term(s) such as `shipped`.
- Expose mode-aware wording externally.
- Tradeoff: internal/external dual semantics can drift and increase operator/debug ambiguity.

### Option B — Replace generic lifecycle wording with mode-aware fulfillment naming
- Introduce explicit mode-aware fulfillment progression labels (later contract freeze).
- Tradeoff: clearer truth model but requires tighter migration planning and compatibility handling.

### Option C — Separate order lifecycle and fulfillment progression as distinct tracks
- Keep order truth and fulfillment readiness/progression as separate conceptual state tracks.
- Map customer/admin semantics from explicit composition rules.
- Tradeoff: strongest anti-ambiguity posture, but requires disciplined boundary definitions before implementation.

Initial assessment:
- Option C is the safest conceptual direction for truth preservation,
- but final choice must be frozen in a dedicated contract slice.

---

## 7) Evaluation Criteria for Future Contract Freeze

Future naming/state freeze must optimize for:
1. Truthfulness.
2. Mode-specific clarity.
3. No fake shipping semantics.
4. Explicit compatibility with `pickup_local` and `delivery_local`.
5. Compatibility with B2/B3 communication truth discipline.
6. Low contradiction risk with existing order/payment semantics.
7. Implementation safety (minimize irreversible semantic debt).

---

## 8) Must-Never-Happen Outcomes

1. Using `shipped` as a vague catch-all for all local fulfillment progression.
2. Reusing one shared readiness label that is false for one mode.
3. Customer communication implying carrier behavior that does not exist.
4. Collapsing payment confirmation and fulfillment readiness into one semantic step.
5. Local-delivery semantics that erase pickup-specific truth.
6. Pickup wording that treats local delivery as identical.

---

## 9) Recommendation for Next Slice

Do not implement runtime fulfillment naming/readiness changes until a dedicated **B4.4 contract-freeze slice** explicitly freezes naming/state policy, including layer separation rules and mode-aware readiness/progression semantics.

---

## 10) Acceptance Checklist (Binary PASS/FAIL)

- [x] PASS: Docs-only brainstorming; no runtime/schema/API/UI implementation content.
- [x] PASS: Problem statement explicitly captures `shipped` vs local-fulfillment semantic collision.
- [x] PASS: Dangerous ambiguity impacts are explicitly mapped across customer/admin/runtime concerns.
- [x] PASS: Required semantic layers are explicit and non-collapsed.
- [x] PASS: Terminology conflict inventory includes `shipped`, `ready_for_pickup`, `ready_for_local_delivery`, and progression distinctions.
- [x] PASS: Multiple reconciliation options are listed with tradeoffs.
- [x] PASS: Evaluation criteria for future freeze are explicit and implementation-safe.
- [x] PASS: Must-never-happen anti-patterns are explicit.
- [x] PASS: One strict next-slice recommendation is present.
