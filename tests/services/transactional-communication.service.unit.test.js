import { jest } from '@jest/globals';
import {
  createConfirmedCommunicationIntent,
  createPendingConfirmationCommunicationIntent,
  createReadyCommunicationIntent,
  createUnderReviewCommunicationIntent,
} from '../../src/services/transactional-communication.service.js';

function buildPendingOrder(overrides = {}) {
  return {
    id: 'ord-comm-1',
    userId: 'user-1',
    status: 'pending',
    fulfillmentMode: 'pickup_local',
    fulfillmentSnapshot: { mode: 'pickup_local' },
    items: [{ quantity: 1, unitPrice: '9.90', product: { name: 'Sample item' } }],
    createdAt: '2026-04-22T10:00:00.000Z',
    totalAmount: '9.90',
    ...overrides,
  };
}

function buildReadyPickupOrder(overrides = {}) {
  return buildPendingOrder({
    status: 'paid',
    fulfillmentMode: 'pickup_local',
    fulfillmentSnapshot: {
      mode: 'pickup_local',
      readiness: { state: 'ready_for_pickup' },
    },
    ...overrides,
  });
}

function buildReadyDeliveryOrder(overrides = {}) {
  return buildPendingOrder({
    status: 'paid',
    fulfillmentMode: 'delivery_local',
    fulfillmentSnapshot: {
      mode: 'delivery_local',
      readiness: { state: 'ready_for_local_delivery' },
    },
    ...overrides,
  });
}

describe('transactional-communication.service', () => {
  test('creates first-class pending-confirmation communication intent from authoritative pending truth', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue(buildPendingOrder()),
      recordPendingConfirmationCommunicationIntent: jest.fn().mockResolvedValue({ duplicate: false, event: { id: 'evt-1' } }),
    };

    const result = await createPendingConfirmationCommunicationIntent({
      orderId: 'ord-comm-1',
      correlationId: 'cid-1',
      repository,
    });

    expect(result).toMatchObject({
      ok: true,
      outcome: 'created',
      sourceEventId: 'comm.pending_confirmation.order:ord-comm-1',
      representation: {
        classKey: 'order_received_pending_confirmation',
        orderId: 'ord-comm-1',
      },
    });
    expect(result.representation.subject).toBe('Order ord-comm-1 received');
    expect(result.representation.summary).toBe('We received your order. Confirmation is still pending.');
    expect(result.representation.nextStep).toBe('No action is needed right now. Check your account order detail for the latest update.');
    expect(repository.recordPendingConfirmationCommunicationIntent).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 'ord-comm-1',
      sourceEventId: 'comm.pending_confirmation.order:ord-comm-1',
      correlationId: 'cid-1',
      orderStatus: 'pending',
    }));
  });

  test('pending-confirmation proceeds when under-review marker hook returns false', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue(buildPendingOrder()),
      hasUnderReviewCommunicationIntent: jest.fn().mockResolvedValue(false),
      recordPendingConfirmationCommunicationIntent: jest.fn().mockResolvedValue({ duplicate: false, event: { id: 'evt-1' } }),
    };

    const result = await createPendingConfirmationCommunicationIntent({
      orderId: 'ord-comm-1',
      repository,
    });

    expect(result).toMatchObject({
      ok: true,
      outcome: 'created',
      sourceEventId: 'comm.pending_confirmation.order:ord-comm-1',
    });
    expect(repository.hasUnderReviewCommunicationIntent).toHaveBeenCalledWith({ orderId: 'ord-comm-1' });
  });

  test('blocks duplicate semantic intent deterministically', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue(buildPendingOrder()),
      recordPendingConfirmationCommunicationIntent: jest.fn().mockResolvedValue({ duplicate: true }),
    };

    const result = await createPendingConfirmationCommunicationIntent({
      orderId: 'ord-comm-1',
      repository,
    });

    expect(result).toEqual({
      ok: false,
      outcome: 'suppressed',
      reason: 'duplicate_semantic_intent',
      sourceEventId: 'comm.pending_confirmation.order:ord-comm-1',
    });
  });

  test('suppresses stale/stronger truth and avoids weaker pending communication', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue(buildPendingOrder({ status: 'paid' })),
      recordPendingConfirmationCommunicationIntent: jest.fn(),
    };

    const result = await createPendingConfirmationCommunicationIntent({
      orderId: 'ord-comm-1',
      repository,
    });

    expect(result).toEqual({
      ok: false,
      outcome: 'suppressed',
      reason: 'stronger_or_missing_truth',
    });
    expect(repository.recordPendingConfirmationCommunicationIntent).not.toHaveBeenCalled();
  });

  test('fails closed when legitimacy cannot be established from contradictory semantic mapping', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue(buildPendingOrder({
        fulfillmentSnapshot: {
          mode: 'pickup_local',
          completion: { state: 'collected' },
        },
      })),
      recordPendingConfirmationCommunicationIntent: jest.fn(),
    };

    const result = await createPendingConfirmationCommunicationIntent({
      orderId: 'ord-comm-1',
      repository,
    });

    expect(result).toEqual({
      ok: false,
      outcome: 'suppressed',
      reason: 'semantic_contradiction',
    });
    expect(repository.recordPendingConfirmationCommunicationIntent).not.toHaveBeenCalled();
  });

  test('fails closed on dependency-unavailable truth lookup', async () => {
    const err = new Error('db unavailable');
    err.code = 'DB_OPERATION_FAILED';
    const repository = {
      findById: jest.fn().mockRejectedValue(err),
      recordPendingConfirmationCommunicationIntent: jest.fn(),
    };

    const result = await createPendingConfirmationCommunicationIntent({
      orderId: 'ord-comm-1',
      repository,
    });

    expect(result).toEqual({
      ok: false,
      outcome: 'suppressed',
      reason: 'dependency_unavailable',
    });
  });

  test('generated representation never leaks raw internal/operator wording', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue(buildPendingOrder()),
      recordPendingConfirmationCommunicationIntent: jest.fn().mockResolvedValue({ duplicate: false, event: { id: 'evt-1' } }),
    };

    const result = await createPendingConfirmationCommunicationIntent({
      orderId: 'ord-comm-1',
      repository,
    });

    const rendered = JSON.stringify(result.representation).toLowerCase();
    expect(rendered).not.toContain('remediation');
    expect(rendered).not.toContain('operator');
    expect(rendered).not.toContain('audit');
    expect(rendered).not.toContain('confirmed');
    expect(rendered).not.toContain('ready');
    expect(rendered).not.toContain('completed');
  });

  test('fails closed when order reference is missing', async () => {
    const result = await createPendingConfirmationCommunicationIntent({});

    expect(result).toEqual({
      ok: false,
      outcome: 'suppressed',
      reason: 'missing_order_reference',
    });
  });

  test('fails closed when called with no arguments', async () => {
    const result = await createPendingConfirmationCommunicationIntent();

    expect(result).toEqual({
      ok: false,
      outcome: 'suppressed',
      reason: 'missing_order_reference',
    });
  });

  test('fails closed with truth_unavailable on non-dependency lookup failure', async () => {
    const repository = {
      findById: jest.fn().mockRejectedValue(new Error('unexpected lookup error')),
      recordPendingConfirmationCommunicationIntent: jest.fn(),
    };

    const result = await createPendingConfirmationCommunicationIntent({
      orderId: 'ord-comm-1',
      repository,
    });

    expect(result).toEqual({
      ok: false,
      outcome: 'suppressed',
      reason: 'truth_unavailable',
    });
  });

  test('fails closed with dependency_unavailable when intent recording dependency is unavailable', async () => {
    const err = new Error('database down on intent insert');
    err.code = 'DB_OPERATION_FAILED';
    const repository = {
      findById: jest.fn().mockResolvedValue(buildPendingOrder()),
      recordPendingConfirmationCommunicationIntent: jest.fn().mockRejectedValue(err),
    };

    const result = await createPendingConfirmationCommunicationIntent({
      orderId: 'ord-comm-1',
      repository,
    });

    expect(result).toEqual({
      ok: false,
      outcome: 'suppressed',
      reason: 'dependency_unavailable',
      sourceEventId: 'comm.pending_confirmation.order:ord-comm-1',
    });
  });

  test('fails closed with intent_recording_failed on non-dependency intent recording failure', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue(buildPendingOrder()),
      recordPendingConfirmationCommunicationIntent: jest.fn().mockRejectedValue(new Error('insert failed')),
    };

    const result = await createPendingConfirmationCommunicationIntent({
      orderId: 'ord-comm-1',
      repository,
    });

    expect(result).toEqual({
      ok: false,
      outcome: 'suppressed',
      reason: 'intent_recording_failed',
      sourceEventId: 'comm.pending_confirmation.order:ord-comm-1',
    });
  });

  test('suppresses pending-confirmation when under-review truth was already recorded', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue(buildPendingOrder()),
      hasUnderReviewCommunicationIntent: jest.fn().mockResolvedValue(true),
      recordPendingConfirmationCommunicationIntent: jest.fn(),
    };

    const result = await createPendingConfirmationCommunicationIntent({
      orderId: 'ord-comm-1',
      repository,
    });

    expect(result).toEqual({
      ok: false,
      outcome: 'suppressed',
      reason: 'superseded_by_under_review_truth',
      sourceEventId: 'comm.pending_confirmation.order:ord-comm-1',
    });
    expect(repository.recordPendingConfirmationCommunicationIntent).not.toHaveBeenCalled();
  });

  test('creates under-review communication intent only from authoritative under-review truth', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue(buildPendingOrder({
        status: 'processing_exception',
      })),
      recordUnderReviewCommunicationIntent: jest.fn().mockResolvedValue({ duplicate: false, event: { id: 'evt-ur-1' } }),
      recordPendingConfirmationSupersession: jest.fn().mockResolvedValue({ ok: true, duplicate: false }),
    };

    const result = await createUnderReviewCommunicationIntent({
      orderId: 'ord-comm-1',
      correlationId: 'cid-ur-1',
      repository,
    });

    expect(result).toMatchObject({
      ok: true,
      outcome: 'created',
      sourceEventId: 'comm.under_review.order:ord-comm-1',
      pendingSupersessionEventId: 'comm.pending_confirmation.superseded_by_under_review.order:ord-comm-1',
      representation: {
        classKey: 'under_review',
        orderId: 'ord-comm-1',
      },
    });
    expect(repository.recordUnderReviewCommunicationIntent).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 'ord-comm-1',
      sourceEventId: 'comm.under_review.order:ord-comm-1',
      correlationId: 'cid-ur-1',
      orderStatus: 'processing_exception',
    }));
    expect(repository.recordPendingConfirmationSupersession).toHaveBeenCalledWith({
      orderId: 'ord-comm-1',
      sourceEventId: 'comm.pending_confirmation.superseded_by_under_review.order:ord-comm-1',
      correlationId: 'cid-ur-1',
      orderStatus: 'processing_exception',
    });
  });

  test('suppresses under-review when truth is stronger or missing', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue(buildPendingOrder({ status: 'paid' })),
      recordUnderReviewCommunicationIntent: jest.fn(),
    };

    const result = await createUnderReviewCommunicationIntent({
      orderId: 'ord-comm-1',
      repository,
    });

    expect(result).toEqual({
      ok: false,
      outcome: 'suppressed',
      reason: 'stronger_or_missing_truth',
    });
    expect(repository.recordUnderReviewCommunicationIntent).not.toHaveBeenCalled();
  });

  test('dedupes under-review semantic intent deterministically', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue(buildPendingOrder({ status: 'processing_exception' })),
      recordUnderReviewCommunicationIntent: jest.fn().mockResolvedValue({ duplicate: true }),
      recordPendingConfirmationSupersession: jest.fn(),
    };

    const result = await createUnderReviewCommunicationIntent({
      orderId: 'ord-comm-1',
      repository,
    });

    expect(result).toEqual({
      ok: false,
      outcome: 'suppressed',
      reason: 'duplicate_semantic_intent',
      sourceEventId: 'comm.under_review.order:ord-comm-1',
    });
    expect(repository.recordPendingConfirmationSupersession).not.toHaveBeenCalled();
  });

  test('fails closed when pending supersession cannot be established', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue(buildPendingOrder({ status: 'processing_exception' })),
      recordUnderReviewCommunicationIntent: jest.fn().mockResolvedValue({ duplicate: false, event: { id: 'evt-ur-1' } }),
      recordPendingConfirmationSupersession: jest.fn().mockResolvedValue({ ok: false }),
    };

    const result = await createUnderReviewCommunicationIntent({
      orderId: 'ord-comm-1',
      repository,
    });

    expect(result).toEqual({
      ok: false,
      outcome: 'suppressed',
      reason: 'pending_supersession_uncertain',
      sourceEventId: 'comm.under_review.order:ord-comm-1',
      pendingSupersessionEventId: 'comm.pending_confirmation.superseded_by_under_review.order:ord-comm-1',
    });
  });

  test('under-review representation never leaks raw internal/operator wording', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue(buildPendingOrder({ status: 'processing_exception' })),
      recordUnderReviewCommunicationIntent: jest.fn().mockResolvedValue({ duplicate: false, event: { id: 'evt-ur-1' } }),
      recordPendingConfirmationSupersession: jest.fn().mockResolvedValue({ ok: true }),
    };

    const result = await createUnderReviewCommunicationIntent({
      orderId: 'ord-comm-1',
      repository,
    });

    const rendered = JSON.stringify(result.representation).toLowerCase();
    expect(rendered).not.toContain('remediation');
    expect(rendered).not.toContain('operator');
    expect(rendered).not.toContain('audit');
    expect(rendered).not.toContain('confirmed');
    expect(rendered).not.toContain('ready');
    expect(rendered).not.toContain('completed');
    expect(rendered).not.toContain('cancelled');
  });

  test('fails closed when under-review order reference is missing', async () => {
    const result = await createUnderReviewCommunicationIntent({});
    expect(result).toEqual({
      ok: false,
      outcome: 'suppressed',
      reason: 'missing_order_reference',
    });
  });

  test('fails closed when under-review is called with no arguments', async () => {
    const result = await createUnderReviewCommunicationIntent();
    expect(result).toEqual({
      ok: false,
      outcome: 'suppressed',
      reason: 'missing_order_reference',
    });
  });

  test('fails closed when under-review truth lookup returns null order', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue(null),
    };
    const result = await createUnderReviewCommunicationIntent({
      orderId: 'ord-comm-1',
      repository,
    });
    expect(result).toEqual({
      ok: false,
      outcome: 'suppressed',
      reason: 'stronger_or_missing_truth',
    });
  });

  test('fails closed with truth_unavailable on non-dependency under-review lookup failure', async () => {
    const repository = {
      findById: jest.fn().mockRejectedValue(new Error('lookup failed')),
    };
    const result = await createUnderReviewCommunicationIntent({
      orderId: 'ord-comm-1',
      repository,
    });
    expect(result).toEqual({
      ok: false,
      outcome: 'suppressed',
      reason: 'truth_unavailable',
    });
  });

  test('fails closed with dependency_unavailable on under-review intent recording dependency failure', async () => {
    const error = new Error('db unavailable');
    error.code = 'DB_OPERATION_FAILED';
    const repository = {
      findById: jest.fn().mockResolvedValue(buildPendingOrder({ status: 'processing_exception' })),
      recordUnderReviewCommunicationIntent: jest.fn().mockRejectedValue(error),
    };
    const result = await createUnderReviewCommunicationIntent({
      orderId: 'ord-comm-1',
      repository,
    });
    expect(result).toEqual({
      ok: false,
      outcome: 'suppressed',
      reason: 'dependency_unavailable',
      sourceEventId: 'comm.under_review.order:ord-comm-1',
    });
  });

  test('creates under-review intent when pending supersession hook is unavailable', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue(buildPendingOrder({ status: 'processing_exception' })),
      recordUnderReviewCommunicationIntent: jest.fn().mockResolvedValue({ duplicate: false, event: { id: 'evt-ur-2' } }),
    };
    const result = await createUnderReviewCommunicationIntent({
      orderId: 'ord-comm-1',
      repository,
    });
    expect(result).toMatchObject({
      ok: true,
      outcome: 'created',
      sourceEventId: 'comm.under_review.order:ord-comm-1',
      pendingSupersessionEventId: 'comm.pending_confirmation.superseded_by_under_review.order:ord-comm-1',
    });
  });

  test('fails closed with intent_recording_failed on non-dependency under-review write failure', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue(buildPendingOrder({ status: 'processing_exception' })),
      recordUnderReviewCommunicationIntent: jest.fn().mockRejectedValue(new Error('insert failed')),
    };

    const result = await createUnderReviewCommunicationIntent({
      orderId: 'ord-comm-1',
      repository,
    });

    expect(result).toEqual({
      ok: false,
      outcome: 'suppressed',
      reason: 'intent_recording_failed',
      sourceEventId: 'comm.under_review.order:ord-comm-1',
    });
  });

  test('creates confirmed communication intent only from authoritative confirmed truth', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue(buildPendingOrder({
        status: 'paid',
      })),
      recordConfirmedCommunicationIntent: jest.fn().mockResolvedValue({ duplicate: false, event: { id: 'evt-cf-1' } }),
      recordPendingConfirmationSupersessionByConfirmed: jest.fn().mockResolvedValue({ ok: true, duplicate: false }),
      recordUnderReviewSupersessionByConfirmed: jest.fn().mockResolvedValue({ ok: true, duplicate: false }),
    };

    const result = await createConfirmedCommunicationIntent({
      orderId: 'ord-comm-1',
      correlationId: 'cid-cf-1',
      repository,
    });

    expect(result).toMatchObject({
      ok: true,
      outcome: 'created',
      sourceEventId: 'comm.confirmed.order:ord-comm-1',
      pendingSupersessionEventId: 'comm.pending_confirmation.superseded_by_confirmed.order:ord-comm-1',
      underReviewSupersessionEventId: 'comm.under_review.superseded_by_confirmed.order:ord-comm-1',
      representation: {
        classKey: 'confirmed',
        orderId: 'ord-comm-1',
      },
    });
    expect(result.representation.subject).toBe('Order ord-comm-1 confirmed');
    expect(result.representation.summary).toBe('Your order is confirmed.');
    expect(repository.recordConfirmedCommunicationIntent).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 'ord-comm-1',
      sourceEventId: 'comm.confirmed.order:ord-comm-1',
      correlationId: 'cid-cf-1',
      orderStatus: 'paid',
    }));
  });

  test('suppresses confirmed candidate on stronger truth (ready/completed/cancelled)', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue(buildPendingOrder({
        status: 'paid',
        fulfillmentSnapshot: {
          mode: 'pickup_local',
          readiness: { state: 'ready_for_pickup' },
        },
      })),
      recordConfirmedCommunicationIntent: jest.fn(),
    };

    const result = await createConfirmedCommunicationIntent({
      orderId: 'ord-comm-1',
      repository,
    });

    expect(result).toEqual({
      ok: false,
      outcome: 'suppressed',
      reason: 'stronger_or_missing_truth',
    });
    expect(repository.recordConfirmedCommunicationIntent).not.toHaveBeenCalled();
  });

  test('dedupes confirmed semantic intent deterministically', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue(buildPendingOrder({ status: 'paid' })),
      recordConfirmedCommunicationIntent: jest.fn().mockResolvedValue({ duplicate: true }),
    };

    const result = await createConfirmedCommunicationIntent({
      orderId: 'ord-comm-1',
      repository,
    });

    expect(result).toEqual({
      ok: false,
      outcome: 'suppressed',
      reason: 'duplicate_semantic_intent',
      sourceEventId: 'comm.confirmed.order:ord-comm-1',
    });
  });

  test('fails closed when pending supersession cannot be established for confirmed', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue(buildPendingOrder({ status: 'paid' })),
      recordConfirmedCommunicationIntent: jest.fn().mockResolvedValue({ duplicate: false, event: { id: 'evt-cf-1' } }),
      recordPendingConfirmationSupersessionByConfirmed: jest.fn().mockResolvedValue({ ok: false }),
      recordUnderReviewSupersessionByConfirmed: jest.fn(),
    };

    const result = await createConfirmedCommunicationIntent({
      orderId: 'ord-comm-1',
      repository,
    });

    expect(result).toEqual({
      ok: false,
      outcome: 'suppressed',
      reason: 'pending_supersession_uncertain',
      sourceEventId: 'comm.confirmed.order:ord-comm-1',
      pendingSupersessionEventId: 'comm.pending_confirmation.superseded_by_confirmed.order:ord-comm-1',
      underReviewSupersessionEventId: 'comm.under_review.superseded_by_confirmed.order:ord-comm-1',
    });
  });

  test('fails closed when under-review supersession cannot be established for confirmed', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue(buildPendingOrder({ status: 'paid' })),
      recordConfirmedCommunicationIntent: jest.fn().mockResolvedValue({ duplicate: false, event: { id: 'evt-cf-1' } }),
      recordPendingConfirmationSupersessionByConfirmed: jest.fn().mockResolvedValue({ ok: true }),
      recordUnderReviewSupersessionByConfirmed: jest.fn().mockResolvedValue({ ok: false }),
    };

    const result = await createConfirmedCommunicationIntent({
      orderId: 'ord-comm-1',
      repository,
    });

    expect(result).toEqual({
      ok: false,
      outcome: 'suppressed',
      reason: 'under_review_supersession_uncertain',
      sourceEventId: 'comm.confirmed.order:ord-comm-1',
      pendingSupersessionEventId: 'comm.pending_confirmation.superseded_by_confirmed.order:ord-comm-1',
      underReviewSupersessionEventId: 'comm.under_review.superseded_by_confirmed.order:ord-comm-1',
    });
  });

  test('confirmed representation never leaks raw internal/operator wording and no over-claim', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue(buildPendingOrder({ status: 'paid' })),
      recordConfirmedCommunicationIntent: jest.fn().mockResolvedValue({ duplicate: false, event: { id: 'evt-cf-1' } }),
      recordPendingConfirmationSupersessionByConfirmed: jest.fn().mockResolvedValue({ ok: true }),
      recordUnderReviewSupersessionByConfirmed: jest.fn().mockResolvedValue({ ok: true }),
    };

    const result = await createConfirmedCommunicationIntent({
      orderId: 'ord-comm-1',
      repository,
    });

    const rendered = JSON.stringify(result.representation).toLowerCase();
    expect(rendered).not.toContain('remediation');
    expect(rendered).not.toContain('operator');
    expect(rendered).not.toContain('audit');
    expect(rendered).not.toContain('ready');
    expect(rendered).not.toContain('completed');
    expect(rendered).not.toContain('dispatch');
    expect(rendered).not.toContain('shipped');
  });

  test('fails closed on dependency-unavailable confirmed truth lookup', async () => {
    const err = new Error('db unavailable');
    err.code = 'DB_OPERATION_FAILED';
    const repository = {
      findById: jest.fn().mockRejectedValue(err),
    };

    const result = await createConfirmedCommunicationIntent({
      orderId: 'ord-comm-1',
      repository,
    });

    expect(result).toEqual({
      ok: false,
      outcome: 'suppressed',
      reason: 'dependency_unavailable',
    });
  });

  test('fails closed when confirmed order reference is missing', async () => {
    const result = await createConfirmedCommunicationIntent({});
    expect(result).toEqual({
      ok: false,
      outcome: 'suppressed',
      reason: 'missing_order_reference',
    });
  });

  test('fails closed when confirmed is called with no arguments', async () => {
    const result = await createConfirmedCommunicationIntent();
    expect(result).toEqual({
      ok: false,
      outcome: 'suppressed',
      reason: 'missing_order_reference',
    });
  });

  test('fails closed with truth_unavailable on non-dependency confirmed lookup failure', async () => {
    const repository = {
      findById: jest.fn().mockRejectedValue(new Error('lookup failed')),
    };
    const result = await createConfirmedCommunicationIntent({
      orderId: 'ord-comm-1',
      repository,
    });
    expect(result).toEqual({
      ok: false,
      outcome: 'suppressed',
      reason: 'truth_unavailable',
    });
  });

  test('fails closed with dependency_unavailable on confirmed intent recording dependency failure', async () => {
    const error = new Error('db unavailable');
    error.code = 'DB_OPERATION_FAILED';
    const repository = {
      findById: jest.fn().mockResolvedValue(buildPendingOrder({ status: 'paid' })),
      recordConfirmedCommunicationIntent: jest.fn().mockRejectedValue(error),
    };

    const result = await createConfirmedCommunicationIntent({
      orderId: 'ord-comm-1',
      repository,
    });

    expect(result).toEqual({
      ok: false,
      outcome: 'suppressed',
      reason: 'dependency_unavailable',
      sourceEventId: 'comm.confirmed.order:ord-comm-1',
    });
  });

  test('fails closed with intent_recording_failed on non-dependency confirmed write failure', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue(buildPendingOrder({ status: 'paid' })),
      recordConfirmedCommunicationIntent: jest.fn().mockRejectedValue(new Error('insert failed')),
    };

    const result = await createConfirmedCommunicationIntent({
      orderId: 'ord-comm-1',
      repository,
    });

    expect(result).toEqual({
      ok: false,
      outcome: 'suppressed',
      reason: 'intent_recording_failed',
      sourceEventId: 'comm.confirmed.order:ord-comm-1',
    });
  });

  test('creates confirmed intent when supersession hooks are unavailable', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue(buildPendingOrder({ status: 'paid' })),
      recordConfirmedCommunicationIntent: jest.fn().mockResolvedValue({ duplicate: false, event: { id: 'evt-cf-2' } }),
    };

    const result = await createConfirmedCommunicationIntent({
      orderId: 'ord-comm-1',
      repository,
    });

    expect(result).toMatchObject({
      ok: true,
      outcome: 'created',
      sourceEventId: 'comm.confirmed.order:ord-comm-1',
      pendingSupersessionEventId: 'comm.pending_confirmation.superseded_by_confirmed.order:ord-comm-1',
      underReviewSupersessionEventId: 'comm.under_review.superseded_by_confirmed.order:ord-comm-1',
    });
  });

  test('creates ready communication intent only from authoritative ready pickup truth', async () => {
    const repository = {
      recordReadyCommunicationIntent: jest.fn().mockResolvedValue({ duplicate: false, event: { id: 'evt-rd-1' } }),
      recordPendingConfirmationSupersessionByReady: jest.fn().mockResolvedValue({ ok: true, duplicate: false }),
      recordUnderReviewSupersessionByReady: jest.fn().mockResolvedValue({ ok: true, duplicate: false }),
      recordConfirmedSupersessionByReady: jest.fn().mockResolvedValue({ ok: true, duplicate: false }),
    };

    const result = await createReadyCommunicationIntent({
      orderId: 'ord-comm-1',
      correlationId: 'cid-rd-1',
      repository,
      authoritativeOrder: buildReadyPickupOrder(),
    });

    expect(result).toMatchObject({
      ok: true,
      outcome: 'created',
      sourceEventId: 'comm.ready.order:ord-comm-1',
      pendingSupersessionEventId: 'comm.pending_confirmation.superseded_by_ready.order:ord-comm-1',
      underReviewSupersessionEventId: 'comm.under_review.superseded_by_ready.order:ord-comm-1',
      confirmedSupersessionEventId: 'comm.confirmed.superseded_by_ready.order:ord-comm-1',
      representation: {
        classKey: 'ready',
        orderId: 'ord-comm-1',
        subject: 'Order ord-comm-1 ready for pickup',
        summary: 'Your order is ready for pickup.',
        actionRequiredNow: true,
      },
    });
    expect(repository.recordReadyCommunicationIntent).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 'ord-comm-1',
      sourceEventId: 'comm.ready.order:ord-comm-1',
      correlationId: 'cid-rd-1',
      orderStatus: 'paid',
    }));
  });

  test('creates ready communication with mode-aware local delivery semantics', async () => {
    const repository = {
      recordReadyCommunicationIntent: jest.fn().mockResolvedValue({ duplicate: false, event: { id: 'evt-rd-2' } }),
      recordPendingConfirmationSupersessionByReady: jest.fn().mockResolvedValue({ ok: true }),
      recordUnderReviewSupersessionByReady: jest.fn().mockResolvedValue({ ok: true }),
      recordConfirmedSupersessionByReady: jest.fn().mockResolvedValue({ ok: true }),
    };

    const result = await createReadyCommunicationIntent({
      orderId: 'ord-comm-1',
      repository,
      authoritativeOrder: buildReadyDeliveryOrder(),
    });

    expect(result).toMatchObject({
      ok: true,
      outcome: 'created',
      representation: {
        classKey: 'ready',
        orderId: 'ord-comm-1',
        subject: 'Order ord-comm-1 ready for local delivery',
        summary: 'Your order is ready for local delivery.',
        actionRequiredNow: false,
      },
    });
    expect(result.representation.summary.toLowerCase()).not.toContain('shipped');
    expect(result.representation.summary.toLowerCase()).not.toContain('delivered');
    expect(result.representation.summary.toLowerCase()).not.toContain('completed');
    expect(result.representation.summary.toLowerCase()).not.toContain('dispatch');
  });

  test('fails closed for ready when missing fulfillment mode semantics (semantic contradiction)', async () => {
    const repository = {
      recordReadyCommunicationIntent: jest.fn(),
    };

    const result = await createReadyCommunicationIntent({
      orderId: 'ord-comm-1',
      repository,
      authoritativeOrder: buildPendingOrder({
        status: 'paid',
        fulfillmentMode: 'pickup_local',
        fulfillmentSnapshot: {
          mode: 'pickup_local',
          readiness: { state: 'ready_for_local_delivery' },
        },
      }),
    });

    expect(result).toEqual({
      ok: false,
      outcome: 'suppressed',
      reason: 'stronger_or_missing_truth',
    });
    expect(repository.recordReadyCommunicationIntent).not.toHaveBeenCalled();
  });

  test('ready suppresses stale or stronger truth (completed/cancelled/under-review) and never falls back to under-review emission', async () => {
    const repository = {
      recordReadyCommunicationIntent: jest.fn(),
      recordUnderReviewCommunicationIntent: jest.fn(),
    };

    const completed = await createReadyCommunicationIntent({
      orderId: 'ord-comm-1',
      repository,
      authoritativeOrder: buildReadyPickupOrder({
        fulfillmentSnapshot: {
          mode: 'pickup_local',
          readiness: { state: 'ready_for_pickup' },
          completion: { state: 'collected' },
        },
      }),
    });
    const cancelled = await createReadyCommunicationIntent({
      orderId: 'ord-comm-1',
      repository,
      authoritativeOrder: buildReadyPickupOrder({ status: 'cancelled' }),
    });
    const underReview = await createReadyCommunicationIntent({
      orderId: 'ord-comm-1',
      repository,
      authoritativeOrder: buildPendingOrder({ status: 'processing_exception' }),
    });

    expect(completed.reason).toBe('stronger_or_missing_truth');
    expect(cancelled.reason).toBe('stronger_or_missing_truth');
    expect(underReview.reason).toBe('stronger_or_missing_truth');
    expect(repository.recordReadyCommunicationIntent).not.toHaveBeenCalled();
    expect(repository.recordUnderReviewCommunicationIntent).not.toHaveBeenCalled();
  });

  test('ready dedupes semantic intent deterministically', async () => {
    const repository = {
      recordReadyCommunicationIntent: jest.fn().mockResolvedValue({ duplicate: true }),
    };
    const result = await createReadyCommunicationIntent({
      orderId: 'ord-comm-1',
      repository,
      authoritativeOrder: buildReadyPickupOrder(),
    });

    expect(result).toEqual({
      ok: false,
      outcome: 'suppressed',
      reason: 'duplicate_semantic_intent',
      sourceEventId: 'comm.ready.order:ord-comm-1',
    });
  });

  test('ready fails closed when supersession over weaker pending cannot be established', async () => {
    const repository = {
      recordReadyCommunicationIntent: jest.fn().mockResolvedValue({ duplicate: false }),
      recordPendingConfirmationSupersessionByReady: jest.fn().mockResolvedValue({ ok: false }),
      recordUnderReviewSupersessionByReady: jest.fn(),
      recordConfirmedSupersessionByReady: jest.fn(),
    };

    const result = await createReadyCommunicationIntent({
      orderId: 'ord-comm-1',
      repository,
      authoritativeOrder: buildReadyPickupOrder(),
    });

    expect(result).toEqual({
      ok: false,
      outcome: 'suppressed',
      reason: 'pending_supersession_uncertain',
      sourceEventId: 'comm.ready.order:ord-comm-1',
      pendingSupersessionEventId: 'comm.pending_confirmation.superseded_by_ready.order:ord-comm-1',
      underReviewSupersessionEventId: 'comm.under_review.superseded_by_ready.order:ord-comm-1',
      confirmedSupersessionEventId: 'comm.confirmed.superseded_by_ready.order:ord-comm-1',
    });
  });

  test('ready fails closed when supersession over weaker under-review cannot be established', async () => {
    const repository = {
      recordReadyCommunicationIntent: jest.fn().mockResolvedValue({ duplicate: false }),
      recordPendingConfirmationSupersessionByReady: jest.fn().mockResolvedValue({ ok: true }),
      recordUnderReviewSupersessionByReady: jest.fn().mockResolvedValue({ ok: false }),
      recordConfirmedSupersessionByReady: jest.fn(),
    };

    const result = await createReadyCommunicationIntent({
      orderId: 'ord-comm-1',
      repository,
      authoritativeOrder: buildReadyPickupOrder(),
    });

    expect(result).toEqual({
      ok: false,
      outcome: 'suppressed',
      reason: 'under_review_supersession_uncertain',
      sourceEventId: 'comm.ready.order:ord-comm-1',
      pendingSupersessionEventId: 'comm.pending_confirmation.superseded_by_ready.order:ord-comm-1',
      underReviewSupersessionEventId: 'comm.under_review.superseded_by_ready.order:ord-comm-1',
      confirmedSupersessionEventId: 'comm.confirmed.superseded_by_ready.order:ord-comm-1',
    });
  });

  test('ready fails closed when supersession over weaker confirmed cannot be established', async () => {
    const repository = {
      recordReadyCommunicationIntent: jest.fn().mockResolvedValue({ duplicate: false }),
      recordPendingConfirmationSupersessionByReady: jest.fn().mockResolvedValue({ ok: true }),
      recordUnderReviewSupersessionByReady: jest.fn().mockResolvedValue({ ok: true }),
      recordConfirmedSupersessionByReady: jest.fn().mockResolvedValue({ ok: false }),
    };

    const result = await createReadyCommunicationIntent({
      orderId: 'ord-comm-1',
      repository,
      authoritativeOrder: buildReadyPickupOrder(),
    });

    expect(result).toEqual({
      ok: false,
      outcome: 'suppressed',
      reason: 'confirmed_supersession_uncertain',
      sourceEventId: 'comm.ready.order:ord-comm-1',
      pendingSupersessionEventId: 'comm.pending_confirmation.superseded_by_ready.order:ord-comm-1',
      underReviewSupersessionEventId: 'comm.under_review.superseded_by_ready.order:ord-comm-1',
      confirmedSupersessionEventId: 'comm.confirmed.superseded_by_ready.order:ord-comm-1',
    });
  });

  test('ready never leaks raw internal/operator wording', async () => {
    const repository = {
      recordReadyCommunicationIntent: jest.fn().mockResolvedValue({ duplicate: false }),
      recordPendingConfirmationSupersessionByReady: jest.fn().mockResolvedValue({ ok: true }),
      recordUnderReviewSupersessionByReady: jest.fn().mockResolvedValue({ ok: true }),
      recordConfirmedSupersessionByReady: jest.fn().mockResolvedValue({ ok: true }),
    };

    const result = await createReadyCommunicationIntent({
      orderId: 'ord-comm-1',
      repository,
      authoritativeOrder: buildReadyPickupOrder(),
    });

    const rendered = JSON.stringify(result.representation).toLowerCase();
    expect(rendered).not.toContain('remediation');
    expect(rendered).not.toContain('operator');
    expect(rendered).not.toContain('audit');
    expect(rendered).not.toContain('under_review');
    expect(rendered).not.toContain('shipped');
    expect(rendered).not.toContain('dispatched');
    expect(rendered).not.toContain('delivered');
    expect(rendered).not.toContain('completed');
  });

  test('ready fails closed on dependency-unavailable and truth-unavailable lookup failures', async () => {
    const depError = new Error('db unavailable');
    depError.code = 'DB_OPERATION_FAILED';
    const dependencyUnavailableResult = await createReadyCommunicationIntent({
      orderId: 'ord-comm-1',
      repository: {
        findById: jest.fn().mockRejectedValue(depError),
      },
    });
    const truthUnavailableResult = await createReadyCommunicationIntent({
      orderId: 'ord-comm-1',
      repository: {
        findById: jest.fn().mockRejectedValue(new Error('lookup failed')),
      },
    });

    expect(dependencyUnavailableResult).toEqual({
      ok: false,
      outcome: 'suppressed',
      reason: 'dependency_unavailable',
    });
    expect(truthUnavailableResult).toEqual({
      ok: false,
      outcome: 'suppressed',
      reason: 'truth_unavailable',
    });
  });

  test('ready fails closed on missing order reference and non-dependency intent recording failure', async () => {
    const missing = await createReadyCommunicationIntent({});
    expect(missing).toEqual({
      ok: false,
      outcome: 'suppressed',
      reason: 'missing_order_reference',
    });

    const failedWrite = await createReadyCommunicationIntent({
      orderId: 'ord-comm-1',
      repository: {
        recordReadyCommunicationIntent: jest.fn().mockRejectedValue(new Error('insert failed')),
      },
      authoritativeOrder: buildReadyPickupOrder(),
    });
    expect(failedWrite).toEqual({
      ok: false,
      outcome: 'suppressed',
      reason: 'intent_recording_failed',
      sourceEventId: 'comm.ready.order:ord-comm-1',
    });
  });

  test('ready fails closed on dependency-unavailable intent recording failure', async () => {
    const err = new Error('db unavailable');
    err.code = 'DB_OPERATION_FAILED';
    const result = await createReadyCommunicationIntent({
      orderId: 'ord-comm-1',
      repository: {
        recordReadyCommunicationIntent: jest.fn().mockRejectedValue(err),
      },
      authoritativeOrder: buildReadyPickupOrder(),
    });
    expect(result).toEqual({
      ok: false,
      outcome: 'suppressed',
      reason: 'dependency_unavailable',
      sourceEventId: 'comm.ready.order:ord-comm-1',
    });
  });

  test('valid confirmed-to-ready progression creates ready only with no under-review intent path', async () => {
    const repository = {
      recordReadyCommunicationIntent: jest.fn().mockResolvedValue({ duplicate: false }),
      recordPendingConfirmationSupersessionByReady: jest.fn().mockResolvedValue({ ok: true }),
      recordUnderReviewSupersessionByReady: jest.fn().mockResolvedValue({ ok: true }),
      recordConfirmedSupersessionByReady: jest.fn().mockResolvedValue({ ok: true }),
      recordUnderReviewCommunicationIntent: jest.fn(),
    };
    const result = await createReadyCommunicationIntent({
      orderId: 'ord-comm-1',
      repository,
      authoritativeOrder: buildReadyPickupOrder(),
    });

    expect(result.ok).toBe(true);
    expect(result.representation.classKey).toBe('ready');
    expect(repository.recordUnderReviewCommunicationIntent).not.toHaveBeenCalled();
  });
});
