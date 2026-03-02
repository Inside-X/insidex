export const ORDER_TRANSITIONS = Object.freeze({
  __initial__: Object.freeze(['pending']),
  pending: Object.freeze(['paid', 'cancelled']),
  paid: Object.freeze(['shipped']),
  shipped: Object.freeze([]),
  cancelled: Object.freeze([]),
});

export class OrderInvalidTransitionError extends Error {
  constructor({ fromStatus = null, toStatus, meta = {} }) {
    super(`Invalid order transition: ${fromStatus ?? 'null'} -> ${toStatus}`);
    this.name = 'OrderInvalidTransitionError';
    this.statusCode = 409;
    this.code = 'ORDER_INVALID_TRANSITION';
    this.fromStatus = fromStatus;
    this.toStatus = toStatus;
    this.meta = meta;
  }
}

function normalizeStatus(status) {
  return typeof status === 'string' ? status.trim().toLowerCase() : null;
}

export function assertValidTransition(fromStatus, toStatus, meta = {}) {
  const from = normalizeStatus(fromStatus);
  const to = normalizeStatus(toStatus);

  const allowed = from === null ? ORDER_TRANSITIONS.__initial__ : ORDER_TRANSITIONS[from] || [];
  if (!to || !allowed.includes(to)) {
    throw new OrderInvalidTransitionError({ fromStatus: from, toStatus: to, meta });
  }

  return true;
}

export function nextStatusForEvent({ provider, eventType, currentStatus } = {}) {
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  const normalizedEventType = String(eventType || '').trim().toLowerCase();

  if (!normalizedProvider || !normalizedEventType) return null;

  if (normalizedProvider === 'stripe' && normalizedEventType === 'payment_intent.succeeded') {
    return 'paid';
  }

  if (normalizedProvider === 'paypal' && normalizedEventType === 'payment.capture.completed') {
    return 'paid';
  }

  return null;
}

export default assertValidTransition;