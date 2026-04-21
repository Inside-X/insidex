# EPIC-6.B7.0 — Transactional Emails / Notifications Brainstorming

- Type: Brainstorming (docs-only)
- Status: Drafted for B7.0
- Date (UTC): 2026-04-21
- Canonical scope alignment reference: `main@add752ffa4ed3b4523f882abc2816ea417a1b66e` (branch/SHA mismatch is warning-only unless lineage is inconsistent)

---

## 1) Scope and Non-Goals

This slice is a **docs-only brainstorming document** to bound the first transactional communication problem space.

In scope:
- Bounded product/operational problem framing for first transactional customer communications.
- Candidate communication goals and candidate trigger-space classes.
- Legitimacy/anti-duplication risk framing.
- Customer wording, comprehension, readability, and degraded communication constraints.
- Alignment constraints with frozen B2/B3/B4/B6 truths.

Non-goals (explicit):
- This is **not** a contract freeze.
- This does **not** implement email sending.
- This does **not** choose or integrate a provider.
- This does **not** define final DB schema.
- This does **not** define final trigger-engine code.
- This does **not** define final template markup/HTML.
- This does **not** define full future multi-channel platform behavior.
- This does **not** redefine frozen payment/order/fulfillment semantics.

---

## 2) Problem Statement

The product gap is not “send email” in isolation.

After placing an order, customers should not be forced to rely only on passive account refresh/checking to understand what changed. The first transactional communication layer should:
- increase trust,
- improve clarity and reassurance,
- remain strictly truthful,
- never run ahead of authoritative business truth,
- and reduce confusion rather than add communication noise.

Core risk to prevent: communications that are technically sent but semantically wrong, contradictory, duplicated, stale, or over-claiming finality.

---

## 3) Candidate Communication Goals (Brainstorm, Non-Frozen)

Candidate practical goals for the first bounded layer:
1. Confirm the order was received (without implying final confirmation when not true).
2. Communicate pending/under-review posture when applicable.
3. Notify meaningful customer-visible state progression when truth materially changes.
4. Explain what happens next in calm, non-technical language.
5. Reinforce order reference and customer-safe account visibility path.
6. Reduce uncertainty without promising timing/outcome not yet proven.
7. Keep customer wording coherent with account list/detail surfaces.
8. Preserve trust under degraded conditions (partial truth, delayed send, temporary transport failure).

These are candidate goals only; no frozen trigger contract is defined here.

---

## 4) Candidate Trigger-Space (Brainstorm, Non-Frozen)

Candidate customer communication classes that may legitimately exist in first scope:
1. Order received / pending confirmation.
2. Under review / issue handling active.
3. Confirmed.
4. Ready (mode-aware local fulfillment semantics).
5. Completed.
6. Cancelled.
7. Dispatch/in-motion (delivery-local only, only when truth exists and is customer-relevant).

Boundary notes:
- These are **candidate communication classes**, not a final trigger matrix.
- Later trigger policy must remain aligned with frozen B2/B3/B4/B6 truth boundaries.
- Dispatch/in-motion is optional and conditional; it must not be fabricated from readiness or payment truth.
- `shipped` must not be reused as canonical local-fulfillment customer truth.

---

## 5) Trigger Legitimacy / Anti-Duplication (Brainstorm)

Problem space and constraints to carry into next freeze:

1. **Duplicate send risk**
   - Same truth event can be reprocessed, retried, or replayed.
   - Customer must not receive repeated confusing notices for one semantic transition.

2. **Conflicting message risk**
   - Out-of-order sends can produce contradictory perceived truth (e.g., weaker message after stronger/final message).
   - Stronger/final semantics must not be followed by stale weaker semantics for same order truth path.

3. **Stale message risk**
   - A communication candidate may become obsolete between trigger detection and send attempt.
   - If stale/contradictory at send-time, suppress rather than overstate.

4. **Partial truth risk**
   - Trigger eligibility may be inferred from incomplete snapshots.
   - Candidate communication must be gated by authoritative, non-contradictory truth boundaries.

5. **Retry/idempotency risk**
   - Transport retries are operationally necessary; customer-facing duplication is not.
   - Future design must enforce semantic idempotency boundaries, not only network retry behavior.

6. **Race condition risk**
   - Truth may change while send attempt is queued/in-flight.
   - Future contract must define anti-race legitimacy checks before emission.

7. **Provider/transport degraded risk**
   - Event truth can be valid while outbound send fails/delays.
   - Failure mode must remain truthful, auditable, and fail-closed (no fabricated success claims about delivery/receipt).

No engine design is specified here; only risk boundaries are framed.

---

## 6) Customer Wording / Comprehension (Brainstorm)

Transactional communication should optimize for comprehension and trust:
- Calm and clear phrasing.
- No technical jargon.
- No operator/remediation/audit raw language.
- No ambiguous promise or hidden certainty.
- No collapse of distinct truths (payment/order/mode/readiness/completion/dispatch/internal).
- Alignment with wording customers already see in account list/detail surfaces.
- Useful, concise next-step/reassurance text when relevant.

Quality bar:
- Message should answer “what changed?” and “what should I do now?” without over-claiming.
- If no action is needed, say so explicitly and calmly.

---

## 7) Information Hierarchy Inside Messages (Brainstorm)

### 7.1 Primary (must generally appear)
- Order identifier/reference.
- Customer-safe status wording (current semantic class).
- Fulfillment mode label when relevant.
- Short “what this means now” line.

### 7.2 Secondary (useful in most cases)
- Concise item summary.
- Totals/payment wording when appropriate and truthful.
- Link/path back to account order detail.
- Brief next-step/reassurance guidance.

### 7.3 Contextual (only when truth-relevant)
- Readiness wording only when readiness truth exists.
- Completion wording only when completion truth exists.
- Dispatch/in-motion wording only when dispatch truth exists and mode supports it.
- Degraded note when message is intentionally limited for truth-safety.

### 7.4 Internal (must never appear raw)
- Internal remediation reason codes.
- Audit/operator-specific diagnostics.
- Replay/idempotency internals.
- Internal contradictions/escalation labels not meant for customers.

Rule: If information cannot be stated truthfully and clearly, omit or degrade rather than speculate.

---

## 8) Visual / Readability / Presentation Principles (Future Templates)

Principles for later template implementation (no template markup defined here):
- Readable and calm first.
- Modern, clean, low-noise layout.
- Strong scanning hierarchy (headline -> key status -> key facts -> next step).
- Mobile-friendly reading defaults.
- Controlled information density (enough to act, not enough to overwhelm).
- Clear emphasis without aggressive urgency patterns.
- Consistent structure across communication classes.
- Accessibility-aware contrast/typography and predictable section ordering.

---

## 9) Degraded / Failure Handling (Brainstorm)

Required degraded posture boundaries:

1. **Truth-limited state**
   - Use reduced, truthful wording classes.
   - Never substitute guessed finality.

2. **Provider send failure**
   - Treat communication transport separately from business truth.
   - Do not claim customer was notified when transport is unconfirmed.

3. **Event happened, message delayed**
   - Later send must be validated for freshness/consistency.
   - Suppress stale/contradictory messages.

4. **System uncertainty**
   - Prefer non-final, accountable wording (“update in progress”-style semantics) over strong/final class claims.

5. **Contradiction risk**
   - If candidate message may conflict with newer customer-visible truth, fail closed and do not emit.

6. **Account surface remains source of current truth**
   - Communication may lag; account detail remains canonical customer self-service anchor.

---

## 10) Relationship with Account / Order Surfaces

Transactional communication should reinforce existing customer surfaces, not compete with them.

Rules:
1. Message wording must remain semantically aligned with account list/detail wording classes.
2. Message may summarize but must not claim richer truth than account/order detail can justify.
3. Message should direct customer to account/order detail for latest canonical view when useful.
4. Degraded communication should still remain coherent with what customer sees in-account.

---

## 11) Admin / Operator Implications (Bounded Brainstorm)

Minimal future needs (without opening a broad messaging ops platform):
1. Visibility of send outcome class (attempted/sent/failed/deferred) at bounded operational level.
2. Bounded auditability linking communication attempts to authoritative order truth context.
3. Confidence that emitted customer semantics match allowed truth classes.
4. Guardrails against silent duplicate sends and silent contradictory sends.

Out of scope here: comprehensive campaign tooling, broad inbox tooling, or cross-channel orchestration platform.

---

## 12) Out-of-Scope Expansion Risks (Anti-Drift)

If uncontrolled, this line can drift into:
1. Building a broad notification platform too early.
2. Multi-channel expansion (SMS/push/chat) before first bounded email semantics are stable.
3. Full customer preference-center rollout too early.
4. Support portal/ticketing responsibilities bleeding into transactional layer.
5. Marketing/CRM contamination of transactional semantics.
6. Raw internal state exposure to customers.
7. Over-eager trigger matrices that outrun proven truth contracts.

---

## 13) Strict Recommendation for Next Freeze

Open **one dedicated contract-freeze slice** for the first bounded transactional communication contract **before any runtime/provider/template implementation**.

---

## 14) Acceptance Checklist (Binary PASS/FAIL)

- [x] PASS: Docs-only brainstorming scope is explicit.
- [x] PASS: Non-goals explicitly exclude runtime/provider/schema/template implementation.
- [x] PASS: Candidate trigger-space is explicitly non-frozen and semantics-aligned.
- [x] PASS: Trigger legitimacy and anti-duplication risk space is explicit.
- [x] PASS: Customer wording/comprehension boundaries are explicit and anti-leak.
- [x] PASS: Information hierarchy includes must-show / contextual / never-show distinctions.
- [x] PASS: Visual/readability principles are defined at principle level only.
- [x] PASS: Degraded/failure handling posture is explicit and fail-closed.
- [x] PASS: Account/list/detail alignment boundary is explicit.
- [x] PASS: Admin/operator needs are bounded and non-platform.
- [x] PASS: Out-of-scope expansion risks are explicitly enumerated.
- [x] PASS: Exactly one strict next-step recommendation is present.
