# EPIC6 — B4.7D Dispatch / In-Motion Fulfillment Contract Freeze

- Type: Contract freeze (docs-only)
- Status: Frozen for B4.7D
- Date (UTC): 2026-04-16
- Canonical scope alignment reference: `main@188c116a1b2398275d80742273ff3134e1a62e55` (branch/SHA mismatch is warning-only unless lineage is inconsistent)

---

## 1) Scope and Non-Goals

This slice is a **docs-only contract freeze** for dispatch / in-motion semantics in the current local-fulfillment phase.

In scope:
- Freezing dispatch / in-motion semantic boundaries.
- Freezing mode-aware applicability rules for dispatch / in-motion.
- Freezing anti-collapse rules between readiness, dispatch/in-motion, and completion.
- Freezing fail-closed rules for future runtime work.

Non-goals (explicit):
- No runtime implementation.
- No schema migration.
- No route/controller changes.
- No UI implementation.
- No driver-assignment platform design.
- No route optimization design.
- No message transport implementation.
- No pricing/fee policy.
- No carrier shipping model.
- No fake shipping abstraction.
- No broad logistics redesign.

---

## 2) Contract Purpose

This freeze defines what dispatch / in-motion **may** and **must not** mean in this phase.

Later implementation must not infer these semantics loosely from readiness or completion.

Dispatch / in-motion, if present, remains a distinct fulfillment-progression truth layer that does not replace readiness and does not replace completion.

---

## 3) Dispatch / In-Motion Necessity Assessment by Mode

### 3.1 `pickup_local`
Dispatch / in-motion is **not applicable** in this phase.

Rationale: pickup has no truthful “outbound movement to customer destination” seam in current local pickup operations.

Frozen rule: pickup must not receive synthetic dispatch labels to mirror delivery vocabulary.

### 3.2 `delivery_local`
Dispatch / in-motion is **conditionally applicable** only when there is truthful operational evidence that delivery handoff execution has started and delivery is actively underway.

Frozen rule: delivery may use bounded dispatch/in-motion semantics only when those semantics are distinct from readiness and distinct from completion.

### 3.3 Cross-mode conclusion
Applicability is explicitly mode-different:
- `pickup_local`: no dispatch / in-motion semantic track.
- `delivery_local`: optional bounded dispatch / in-motion semantic track.

---

## 4) Required Semantic Separation

The following truths are distinct and must not collapse into one label:
1. Payment truth.
2. Order lifecycle truth.
3. Fulfillment mode truth.
4. Readiness truth.
5. Dispatch / in-motion truth.
6. Completion truth.
7. Customer-visible truth.
8. Admin/operator truth.

Must-not-collapse rules:
- Payment truth must not stand in for fulfillment progression truth.
- Readiness truth must not stand in for dispatch/in-motion truth.
- Dispatch/in-motion truth must not stand in for completion truth.
- Customer/admin wording must not compress multiple layers into one ambiguous term.

---

## 5) Dispatch / In-Motion Semantic Boundary (Frozen)

For this phase, dispatch / in-motion may only be interpreted as follows:

1. **Dispatch** (if used for `delivery_local` only):
   - Meaning: local-delivery handoff execution has begun after readiness, i.e., operational delivery execution has actually started.
   - Forbidden meaning: “ready” or “completed.”

2. **In-motion** (if used for `delivery_local` only):
   - Meaning: local delivery is actively underway toward destination after dispatch has begun and before completion.
   - Forbidden meaning: “ready,” “completed,” or generic “shipped.”

3. Separate truth requirement:
   - Dispatch/in-motion requires separate truth from readiness.
   - Dispatch/in-motion requires separate truth from completion.

4. Optionality in this phase:
   - Dispatch/in-motion is optional at phase level.
   - Absence of dispatch/in-motion semantics is valid and must not be auto-synthesized.

5. Mode boundary:
   - Dispatch/in-motion may exist only for `delivery_local` in this phase.

---

## 6) Relationship to Readiness and Completion

Frozen boundaries:
1. Readiness must not imply dispatch/in-motion.
2. Dispatch/in-motion must not imply completion.
3. Completion must not imply that dispatch/in-motion necessarily occurred for all flows.
4. Dispatch/in-motion must not be backfilled retrospectively where no truthful seam existed.

Consequences:
- A delivery order may be ready without being dispatched.
- A delivery order may be dispatched/in-motion without being completed.
- A completed order must not receive invented historical dispatch claims if the seam was not traversed.

---

## 7) Mode-Aware Applicability Rules

### 7.1 `pickup_local`
Allowed:
- Readiness semantics (`ready_for_pickup`) and completion semantics (`collected`) per existing freezes.

Forbidden:
- Any dispatch/in-motion semantic class or wording.
- Any synthetic “out for pickup” equivalent.

### 7.2 `delivery_local`
Allowed:
- Readiness semantics (`ready_for_local_delivery`) without dispatch.
- Optional dispatch/in-motion semantics only when operational truth exists.
- Completion semantics (`delivered_local`) independent of fake shipping terms.

Forbidden:
- Collapsing readiness+dispatch+completion into one shared state label.
- Using one shared label across pickup and delivery when it is false for pickup.

---

## 8) Customer/Admin Wording Boundary

If dispatch/in-motion is surfaced in a future slice:

1. Customer wording must not imply carrier logistics, parcel-network behavior, or external tracking not present in this phase.
2. Admin wording must not depend on vague `shipped` semantics.
3. Wording must remain mode-aware.
4. Wording must remain truthful to known operational reality.
5. If exact operational truth is unavailable, degraded wording must avoid over-claiming dispatch/in-motion and must remain non-fabricated.

---

## 9) Allowed and Forbidden Semantic Patterns

### 9.1 Allowed patterns
1. `delivery_local`: ready state exists, dispatch not yet started.
2. `delivery_local`: dispatch/in-motion started, completion not yet reached.
3. `pickup_local`: ready -> collected, with no dispatch layer at all.
4. `delivery_local`: completed (`delivered_local`) with no carrier/shipping wording.
5. `delivery_local`: dispatch semantics explicitly bounded to operational in-motion interval only.

### 9.2 Forbidden patterns
1. Inferring dispatch from readiness alone.
2. Inferring completion from dispatch alone.
3. Marking `pickup_local` orders as dispatched/in-motion.
4. Using generic `shipped` as canonical local fulfillment progression truth.
5. Backfilling dispatch/in-motion history on orders that never traversed a truthful dispatch seam.

---

## 10) Fail-Closed Rules

Future runtime implementation must fail closed as follows:

1. No dispatch/in-motion state may be created when dispatch truth is absent.
2. No dispatch/in-motion state may be inferred from readiness alone.
3. No completion state may be inferred from dispatch/in-motion alone.
4. No fallback to generic shipping wording (`shipped`) when local-mode truth is missing.
5. No invented dispatch timeline/history for orders without explicit dispatch seam traversal.
6. No cross-mode dispatch abstraction that forces dispatch semantics into `pickup_local`.

---

## 11) Deferred Implementation Questions (Intentionally Deferred)

1. Exact runtime enum/state symbols for dispatch/in-motion.
2. Exact route/API surface shape if dispatch/in-motion is implemented later.
3. Exact event persistence structure and audit log shape.
4. Exact admin/UI projection mapping.
5. Exact customer communication triggers/templates for dispatch/in-motion.
6. Exact operational actor/tooling model.

---

## 12) Strict Recommendation

Only after this B4.7D freeze, and only if dispatch/in-motion remains truly necessary for `delivery_local`, open one bounded runtime slice for dispatch/in-motion semantics; do not force runtime dispatch implementation when truthful phase behavior is absence/minimalism.

---

## 13) Acceptance Checklist (Binary)

- [x] PASS: Dispatch/in-motion applicability is explicitly mode-aware (`delivery_local` conditional, `pickup_local` absent).
- [x] PASS: Readiness, dispatch/in-motion, and completion boundaries are explicitly separated.
- [x] PASS: `shipped` is not reintroduced as canonical local fulfillment truth.
- [x] PASS: Fail-closed rules forbid inference/backfill/fabrication.
- [x] PASS: Scope remains docs-only with no runtime/tooling design.
