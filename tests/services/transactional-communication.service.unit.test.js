import { jest } from '@jest/globals';
import { createPendingConfirmationCommunicationIntent } from '../../src/services/transactional-communication.service.js';

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
});
