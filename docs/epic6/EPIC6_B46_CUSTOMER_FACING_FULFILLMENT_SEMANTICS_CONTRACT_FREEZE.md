# EPIC-6.B4.6 — Customer-Facing Fulfillment Semantics Contract Freeze

- Type: Contract freeze (docs-only)
- Status: Frozen for B4.6
- Date (UTC): 2026-04-09
- Canonical scope alignment reference: `main@9263c00a69a48dba5beb90c4914afc0b6af109d5` (branch/SHA mismatch is warning-only unless lineage is inconsistent)

---

## 1) Scope and Non-Goals

This slice is a **docs-only contract freeze** for customer-facing fulfillment semantics in the local-fulfillment line.

In scope:
- Freeze customer-visible semantic boundaries for local fulfillment states and announcements.
- Freeze relationship rules between order truth, payment truth, and fulfillment progression wording.
- Freeze mode-specific wording policy for `pickup_local` and `delivery_local`.
- Freeze degraded-wording fallback boundaries when mode-specific detail is unavailable.

Non-goals (explicit):
- No runtime implementation.
- No schema/API/UI implementation.
- No outbox/message transport implementation.
- No template rendering implementation.
- No dispatch workflow design.
- No carrier shipping semantics.
- No pricing/fee policy.

---

## 2) Contract Purpose

This freeze defines what customer-facing fulfillment wording is allowed to mean in this phase.

Later implementation must not emit wording that overstates operational truth, collapses semantic layers, or introduces carrier-like implications.

---

## 3) Governing Truth Model (Customer-Facing)

Frozen customer-facing semantics must preserve explicit separation across:
1. Payment truth.
2. Order lifecycle truth.
3. Fulfillment mode truth (`pickup_local` vs `delivery_local`).
4. Fulfillment readiness/progression truth.
5. Delivery/pickup completion truth.
6. Under-review/problem-handling truth when business outcome is pending or exception-handled.

Must-not-collapse rules:
- Payment-confirmed wording must not be used as readiness wording.
- Readiness wording must not be used as completion wording.
- Generic “shipping” wording must not stand in for mode-specific local fulfillment truth.
- Under-review/problem-handling wording must not imply readiness or completion.

---

## 4) Mode-Specific Customer Semantics

### 4.1 `pickup_local`
Allowed customer-facing semantics:
- Order confirmation wording.
- Pickup readiness wording (e.g., “ready for pickup” conceptually).
- Pickup completion wording (e.g., “collected” conceptually).

Forbidden semantics:
- Carrier shipment/dispatch implication.
- Delivery-arrival implication when fulfillment mode is pickup.

### 4.2 `delivery_local`
Allowed customer-facing semantics:
- Order confirmation wording.
- Local-delivery readiness wording (e.g., “ready for local delivery” conceptually).
- Local-delivery completion wording (e.g., “delivered” conceptually).

Forbidden semantics:
- Carrier tracking semantics unless such carrier model is explicitly introduced in a separate future freeze.
- Pickup-only completion semantics as a substitute for delivery completion truth.

### 4.3 Cross-mode rule
- Mode-specific meaning must remain explicit whenever pickup and local-delivery semantics differ.
- One ambiguous label must not be used for both mode-specific completion truths.

---

## 5) Legacy Term Policy in Customer-Facing Surfaces

Frozen policy:
1. Legacy `shipped` must not be used as canonical customer-facing fulfillment truth for local fulfillment.
2. If legacy text remains temporarily for compatibility, it must be treated as migration residue, not policy truth.
3. New customer-facing templates/messages for local fulfillment must be mode-aware and non-carrier.

---

## 6) Trigger/Template Alignment Boundary (B3-Compatible)

This freeze aligns with B3/B31/B32 discipline:
1. Trigger truth controls whether communication should occur.
2. Template semantics control what wording is used once a trigger is valid.
3. Fulfillment wording must not exceed what trigger/business truth proves.
4. Degraded wording is permitted when exact fulfillment detail is unavailable, but must remain non-false and non-carrier.

---

## 7) Degraded Wording Policy

Allowed degraded semantics (when detail is temporarily unavailable):
- Neutral “order update” style wording that does not claim readiness/completion without proof.
- Neutral wording that avoids false mode-specific claims when mode detail is missing.

Forbidden degraded semantics:
- Wording that implies delivery completion when only order confirmation is known.
- Wording that implies pickup readiness without readiness truth.
- Degraded wording that reintroduces ambiguous carrier-shipping semantics.

Fail-closed rule:
- If precise fulfillment truth is unavailable at send time, prefer truthful neutral wording rather than speculative mode/progression claims.

---

## 8) Customer/Admin Wording Boundary

Frozen boundary:
1. Customer-visible wording may be simpler than admin/internal wording.
2. Simpler customer wording must never be less truthful than admin/internal truth.
3. Customer wording must never imply shipping/logistics capabilities that are not part of validated business truth.
4. Customer wording must never imply fulfillment certainty (readiness/completion) beyond validated business truth.

---

## 9) Allowed vs Forbidden Customer-Facing Patterns

### 9.1 Allowed patterns
- “Order confirmed” communicated separately from readiness/completion steps.
- Pickup messages using pickup-specific readiness/completion semantics.
- Local-delivery messages using local-delivery-specific readiness/completion semantics.
- Degraded neutral wording that does not over-claim fulfillment progression.
- Under-review/problem-handling wording that clearly indicates pending validation/resolution without claiming readiness/completion.

### 9.2 Forbidden patterns
- Using one generic “shipped” statement as canonical customer progression truth for both local modes.
- Announcing completion semantics before completion truth exists.
- Announcing readiness semantics before readiness truth exists.
- Mode-mismatched wording (delivery phrasing for pickup orders, or inverse).
- Under-review/problem-handling wording that implies readiness/completion while resolution is still pending.

---

## 10) Relationship to Data Sufficiency (B4.5)

Frozen boundary:
1. Customer-facing fulfillment wording must remain consistent with mode-specific data sufficiency policy.
2. If fulfillment data is insufficient for a strong mode-specific claim, wording must degrade to truthful neutral semantics.
3. Customer-facing semantics must not imply destination/handoff certainty not supported by validated data truth.

---

## 11) Deferred Implementation Questions

Deferred intentionally:
1. Exact template catalog and message IDs.
2. Exact localization and copy variants.
3. Exact outbox event/template binding implementation.
4. Exact fallback priority resolution rules in runtime code.
5. Exact migration/removal timeline for legacy wording artifacts.

---

## 12) Strict Recommendation

Only after this B4.6 freeze, and only after all prerequisite dependent freezes in the active fulfillment/customer-communication line are explicitly closed, open the next bounded slice that depends on these customer-facing semantics.

---

## 13) Acceptance Checklist (Binary PASS/FAIL)

- [x] PASS: Docs-only contract freeze; no runtime/schema/API/UI implementation content.
- [x] PASS: Customer-facing semantic separation is explicit (payment/order/mode/readiness/completion).
- [x] PASS: Under-review/problem-handling semantic boundary is explicit and does not imply readiness/completion.
- [x] PASS: Mode-specific wording policy is explicit for `pickup_local` and `delivery_local`.
- [x] PASS: Legacy `shipped` policy is explicit (not canonical customer truth for local fulfillment).
- [x] PASS: B3/B31/B32 alignment boundary is explicit (trigger truth vs wording truth).
- [x] PASS: Customer/admin wording boundary is explicit (simpler customer wording allowed, never less truthful).
- [x] PASS: Degraded wording policy is explicit and fail-closed.
- [x] PASS: Allowed vs forbidden wording patterns are concrete and reviewable.
- [x] PASS: Relationship to B4.5 data sufficiency is explicit.
- [x] PASS: Deferred implementation items are bounded.
- [x] PASS: One strict recommendation is present.
