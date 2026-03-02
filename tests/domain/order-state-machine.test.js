import {
  ORDER_TRANSITIONS,
  OrderInvalidTransitionError,
  assertValidTransition,
  nextStatusForEvent,
} from '../../src/domain/order-state-machine.js';

describe('order state machine policy', () => {
  test('allows all declared transitions from the matrix', () => {
    for (const [from, targets] of Object.entries(ORDER_TRANSITIONS)) {
      for (const to of targets) {
        const fromStatus = from === '__initial__' ? null : from;
        expect(assertValidTransition(fromStatus, to)).toBe(true);
      }
    }
  });

  test('forbids transitions not declared in the matrix', () => {
    const statuses = ['pending', 'paid', 'shipped', 'cancelled'];

    for (const from of [null, ...statuses]) {
      const allowed = from === null ? ORDER_TRANSITIONS.__initial__ : ORDER_TRANSITIONS[from];

      for (const to of statuses) {
        if (allowed.includes(to)) continue;

        expect(() => assertValidTransition(from, to)).toThrow(OrderInvalidTransitionError);
      }
    }
  });

  test('enforces terminal state rules', () => {
    expect(() => assertValidTransition('shipped', 'paid')).toThrow('Invalid order transition');
    expect(() => assertValidTransition('cancelled', 'paid')).toThrow('Invalid order transition');
    expect(() => assertValidTransition('paid', 'cancelled')).toThrow('Invalid order transition');
    expect(assertValidTransition('paid', 'shipped')).toBe(true);
  });

  test('maps provider events to deterministic next state', () => {
    expect(nextStatusForEvent({ provider: 'stripe', eventType: 'payment_intent.succeeded', currentStatus: 'pending' })).toBe('paid');
    expect(nextStatusForEvent({ provider: 'paypal', eventType: 'PAYMENT.CAPTURE.COMPLETED', currentStatus: 'pending' })).toBe('paid');
    expect(nextStatusForEvent({ provider: 'stripe', eventType: 'charge.refunded', currentStatus: 'pending' })).toBeNull();
  });
});