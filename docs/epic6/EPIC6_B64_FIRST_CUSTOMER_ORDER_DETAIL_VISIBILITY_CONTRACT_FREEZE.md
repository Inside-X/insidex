# EPIC6 — B6.4 First Customer Order Detail Visibility Contract Freeze

- Type: Contract freeze (docs-only)
- Status: Frozen for B6.4
- Date (UTC): 2026-04-20
- Canonical scope alignment reference: `main@32075510128735f89bc630c9648e75874349b0bd` (branch/SHA mismatch is warning-only unless lineage is inconsistent)

---

## 1) Scope and non-goals

This slice is a **docs-only contract freeze**.

This freeze covers **only** the first bounded customer **order-detail visibility** layer.

In scope (bounded):
1. First-layer order-detail meaning contract for customer surfaces.
2. Customer-safe detail hierarchy and explanation posture.
3. UX/readability/presentation constraints that are mandatory for this detail layer.

Non-goals (explicit):
1. Not full account-platform design.
2. Not final API payload definition.
3. Not final DB schema definition.
4. Not runtime route/controller/UI implementation.
5. Not a broad event-history platform.
6. Not a returns/refunds/support portal.
7. Not a full design system.
8. Not a redesign of payment/order/fulfillment truth model.
9. Not a definition of every future customer detail capability.

---

## 2) Contract purpose

This freeze defines what the first customer order-detail layer must help the customer understand:
1. What order this is.
2. What was ordered.
3. What the current customer-facing state means.
4. What practical fulfillment/payment context matters now.
5. What next step (or no action) is truthful.

Binding intent:
- Later implementation must not force customers to decode backend/internal semantics.
- Order detail must remain truthful, coherent, readable, reassuring where truthful, and practically useful.
- Visual/UX coherence is part of this contract boundary, not a follow-up concern.

---

## 3) Bounded customer detail surface in scope

First bounded detail surface includes:
1. **Order header** (identity + primary state orientation).
2. **Itemized contents** (what was ordered at practical granularity).
3. **Bounded status / fulfillment / payment visibility** (customer-safe translation only).
4. **Bounded contextual explanation** (only when needed for truth clarity).
5. **Practical fulfillment details already validated at order-time truth capture**.

Still out of scope:
1. Broad account navigation redesign.
2. Cross-order analytics dashboards.
3. Full customer event/audit stream tooling.
4. Support case management UI.
5. Refund/returns orchestration UI.
6. Broad loyalty/subscription/post-purchase platform features.

---

## 4) Detail-page information hierarchy contract

### 4.1 Primary (immediately visible)
Must be visible at top of detail surface:
1. Customer-safe order identifier.
2. Placed date/time.
3. One primary customer-facing status label.
4. Fulfillment mode (`pickup_local` or `delivery_local`, customer-safe wording).

### 4.2 Secondary (default-visible below header)
Must be visible by default below header:
1. Itemized contents (names + quantities + bounded price context).
2. Totals/payment wording at customer-safe clarity level.
3. Readiness/completion detail when truthful and present.
4. Practical pickup/delivery details captured as validated order truth.

### 4.3 Contextual (shown only when relevant)
Show only when condition is true:
1. Dispatch/in-motion wording only when mode is `delivery_local` and dispatch truth is present.
2. Limited/degraded information notice only when visibility is genuinely limited.
3. Under-review/pending-confirmation explanation only when semantically required.
4. Compact reassurance/next-step explanation only when truthful and useful.

### 4.4 Internal (hidden from customer)
Must not be shown raw:
1. Internal notes and operator remarks.
2. Raw internal states/route/state-machine keys.
3. Raw remediation/reconciliation classifications.
4. Raw replay/duplicate/internal-adjustment semantics.
5. Raw internal error/diagnostic classes.
6. Raw audit/event-stream internals.

---

## 5) Header contract

Header must communicate first, without overload:
1. Stable order reference.
2. Current primary customer status.
3. Fulfillment mode.
4. One compact reassurance/next-step line when truthful and relevant.

Hard header constraints:
1. Header must not become dense telemetry.
2. Header must not present multiple competing primary statuses.
3. Header must not include raw internal/operator terminology.
4. Header reassurance text must not over-claim progression or finality.

---

## 6) Item detail contract

First detail layer must expose:
1. Item names.
2. Item quantities.
3. Bounded price/totals context at practical customer level.

Item-detail constraints:
1. No misleading hidden complexity in default representation.
2. No unnecessary density for first-layer readability.
3. Item representation must remain coherent with list summary meaning.
4. This freeze defines content/hierarchy only; no component markup is defined.

---

## 7) Payment / order / fulfillment semantic contract

Detail surface must preserve explicit separation between:
1. Payment truth.
2. Order truth.
3. Fulfillment mode truth.
4. Readiness truth.
5. Completion truth.
6. Dispatch/in-motion truth.
7. Internal/operator truth.

What may appear together:
1. Primary status + fulfillment mode + concise contextual explanation.
2. Payment wording alongside order/fulfillment state only when relationship is non-collapsing.
3. Readiness/completion details where truthful and mode-compatible.

What must remain contextual:
1. Dispatch/in-motion (delivery-only and truth-dependent).
2. Under-review/degraded explanation.
3. Optional practical details and explanatory caveats.

What must never be collapsed:
1. Payment confirmation into readiness/completion.
2. Readiness into completion.
3. Readiness into dispatch/in-motion.
4. Completion into implied dispatch history.
5. Internal/operator truth into customer status wording.

What must not be over-claimed:
1. Finality in non-final states.
2. Readiness when readiness truth is absent.
3. Completion when completion truth is absent.
4. Dispatch/in-motion when dispatch truth is absent.
5. Carrier-like `shipped` semantics as canonical local-fulfillment truth.

---

## 8) Customer status/detail explanation contract

Primary status may be expanded in detail, but expansion must stay bounded and non-confusing.

Required posture by class:
1. **Non-final states**: explicit non-final language; no false certainty.
2. **Under-review/degraded**: explicit limitation/problem-handling context; neutral and truthful.
3. **Ready states**: mode-aware readiness wording; no completion implication.
4. **Completed states**: mode-aware completion wording; no fabricated prior progression.
5. **Cancelled states**: explicit cancellation boundary; no hidden success implication.
6. **Dispatch/in-motion**: only when truthful, relevant, and delivery-mode applicable.

Contract note:
- This freeze defines customer-facing posture only; it does not freeze backend enum design.

---

## 9) Timeline / events boundary

Frozen decision for first detail layer:
- **Allow bounded key-events explanation (optional), not a full timeline platform.**

If key-events explanation is present, it must be:
1. Customer-safe.
2. Bounded to key meaning events only.
3. Truthful and non-speculative.
4. Non-telemetry-like in density and tone.
5. Not a raw internal event stream.

If key-events explanation is not yet implemented:
- Detail surface must still provide contextual sections that preserve equivalent truth clarity.

---

## 10) UX / ergonomics contract

Implementation must satisfy:
1. Easy top-to-bottom scan path.
2. High readability under normal customer attention constraints.
3. Clear grouping of meaning (identity/state/items/payment/fulfillment context).
4. Low cognitive load by default.
5. Practical visibility of important facts without hunting.
6. No visual overload.
7. Obvious reassurance/next-step when relevant and truthful.
8. Mobile-friendly structure and density.
9. Coherent relationship with orders list semantics and reading flow.

---

## 11) Visual / presentation contract

Presentation expectations for first detail surface:
1. Modern and clean customer detail presentation.
2. Calm, coherent hierarchy.
3. Pleasant and fluid interaction posture.
4. Readable spacing and grouping.
5. Important information visible without aggressive noise.
6. Avoid admin-console density.
7. Avoid clutter and stacked visual noise.

Contract limit:
- No mockups/tokens/motion system are defined here; only binding presentation constraints are frozen.

---

## 12) Surface-specific edge handling

First detail-layer edge handling principles:
1. **Old completed orders**: remain readable and discoverable without extra visual weight.
2. **`pickup_local` vs `delivery_local`**: mode distinction must remain explicit.
3. **Readiness present, dispatch absent**: must not imply in-motion.
4. **Completion present**: show completion clearly without inventing missing event history.
5. **Degraded/limited information**: explicit truthful limitation messaging; no fabricated precision.
6. **Under review / confirmation pending**: explicit non-final explanation without alarmist or false-final tone.
7. **Missing optional practical details**: neutral fallback wording; no meaning inversion.

---

## 13) Internal-to-customer translation boundary

Later implementation must translate/suppress/reshape before display:
1. Raw internal states.
2. Raw operator notes.
3. Raw remediation/reconciliation classes.
4. Raw replay/duplicate/internal-adjustment semantics.
5. Raw internal errors and diagnostics.
6. Raw internal route/state-machine names.
7. Raw audit/event-stream internals.

Binding rule:
- Customer wording may simplify but must not become less truthful than underlying business truth.

---

## 14) Relationship with orders list

List/detail consistency requirements:
1. No contradiction between list primary status meaning and detail primary status meaning.
2. Detail may add context, but must not reverse list-level truth.
3. List/detail hierarchy must feel coherent (same facts in expected places).
4. Visual tone and wording posture must stay aligned across list and detail surfaces.

---

## 15) Deferred decisions

Intentionally deferred beyond this freeze:
1. Exact API payload fields.
2. Exact DB schema changes (if any).
3. Exact runtime route/controller structure for detail fetch.
4. Exact component/page architecture.
5. Exact key-events/timeline implementation mechanics.
6. Exact visual token/motion system.
7. Broader account-platform expansion.

---

## 16) Strict recommendation

After this B6.4 freeze, open exactly one bounded runtime slice for the **first customer order-detail visibility seam** aligned to this contract, without opening broad account-platform or broad customer-history implementation scope.

---

## 17) Acceptance checklist (binary)

- [x] PASS: Scope is docs-only and bounded to first order-detail visibility layer.
- [x] PASS: Non-goals explicitly block account-platform, full event platform, and implementation-level drift.
- [x] PASS: Hierarchy contract is explicit across primary/secondary/contextual/internal layers.
- [x] PASS: Header, item, and status-explanation contracts are explicit and non-telemetry.
- [x] PASS: Payment/order/fulfillment/readiness/completion/dispatch/internal separation is explicit.
- [x] PASS: `shipped` is blocked as misleading canonical local-fulfillment truth.
- [x] PASS: UX/ergonomics and visual/presentation constraints are explicitly frozen.
- [x] PASS: Edge handling and degraded handling are explicitly frozen.
- [x] PASS: Internal-to-customer translation boundary is explicit.
- [x] PASS: List/detail consistency requirements are explicit.
- [x] PASS: Deferred decisions are explicit; no implementation design is smuggled in.
- [x] PASS: One strict, bounded next-step recommendation is provided.
