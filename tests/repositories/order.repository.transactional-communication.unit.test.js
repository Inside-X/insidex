import { jest } from '@jest/globals';

async function loadOrderRepository() {
  jest.resetModules();

  const prismaMock = {
    orderEvent: {
      create: jest.fn(),
    },
    $transaction: jest.fn(async (callback) => callback({
      orderEvent: {
        create: prismaMock.orderEvent.create,
      },
    })),
  };

  const normalizeDbError = jest.fn((error) => {
    throw error;
  });

  await jest.unstable_mockModule('../../src/lib/prisma.js', () => ({ default: prismaMock }));
  await jest.unstable_mockModule('../../src/lib/db-error.js', () => ({ normalizeDbError }));

  const { orderRepository } = await import('../../src/repositories/order.repository.js');
  return { orderRepository, prismaMock, normalizeDbError };
}

describe('orderRepository transactional communication seam', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  test('records pending-confirmation communication intent with deterministic payload', async () => {
    const { orderRepository, prismaMock } = await loadOrderRepository();
    const event = { id: 'evt-comm-1' };
    prismaMock.orderEvent.create.mockResolvedValueOnce(event);

    await expect(orderRepository.recordPendingConfirmationCommunicationIntent({
      orderId: 'ord-1',
      sourceEventId: 'comm.pending_confirmation.order:ord-1',
      correlationId: 'cid-1',
      orderStatus: 'pending',
    })).resolves.toEqual({ duplicate: false, event });

    expect(prismaMock.orderEvent.create).toHaveBeenCalledWith({
      data: {
        orderId: 'ord-1',
        type: 'customer_comm_pending_confirmation_candidate',
        fromStatus: 'pending',
        toStatus: 'pending',
        source: 'system',
        sourceEventId: 'comm.pending_confirmation.order:ord-1',
        correlationId: 'cid-1',
      },
    });
  });

  test.each([
    [{ code: 'P2002', meta: { target: ['source_event_id'] } }],
    [{ code: 'P2002' }],
  ])('dedupes pending-confirmation intent writes on unique conflicts: %j', async (errorShape) => {
    const { orderRepository, prismaMock } = await loadOrderRepository();
    const err = Object.assign(new Error('duplicate event'), errorShape);
    prismaMock.orderEvent.create.mockRejectedValueOnce(err);

    await expect(orderRepository.recordPendingConfirmationCommunicationIntent({
      orderId: 'ord-1',
      sourceEventId: 'comm.pending_confirmation.order:ord-1',
      orderStatus: 'pending',
    })).resolves.toEqual({ duplicate: true, event: null });
  });

  test('normalizes non-duplicate pending-confirmation persistence failure', async () => {
    const { orderRepository, prismaMock, normalizeDbError } = await loadOrderRepository();
    const err = Object.assign(new Error('write exploded'), { code: 'P5000' });
    prismaMock.orderEvent.create.mockRejectedValueOnce(err);

    await expect(orderRepository.recordPendingConfirmationCommunicationIntent({
      orderId: 'ord-1',
      sourceEventId: 'comm.pending_confirmation.order:ord-1',
      orderStatus: 'pending',
    })).rejects.toThrow(err);

    expect(normalizeDbError).toHaveBeenCalledWith(err, {
      repository: 'order',
      operation: 'recordPendingConfirmationCommunicationIntent',
    });
  });

  test.each([
    [{}, 'orderId is required for communication intent'],
    [{ orderId: 'ord-1' }, 'sourceEventId is required for communication intent'],
    [{ orderId: 'ord-1', sourceEventId: 'comm.pending_confirmation.order:ord-1', orderStatus: 'paid' }, 'pending-confirmation communication requires pending order truth'],
  ])('rejects invalid pending-confirmation context: %j', async (input, expectedMessage) => {
    const { orderRepository } = await loadOrderRepository();
    await expect(orderRepository.recordPendingConfirmationCommunicationIntent(input)).rejects.toThrow(expectedMessage);
  });

  test('returns insufficient_context when under-review communication context is incomplete', async () => {
    const { orderRepository, prismaMock } = await loadOrderRepository();

    await expect(orderRepository.recordUnderReviewCommunicationUnitFromWebhook({
      orderId: 'ord-1',
      currentStatus: 'pending',
      intendedFinalizationKey: '',
      stripePaymentIntentId: 'pi-1',
    })).resolves.toEqual({
      recorded: false,
      deduped: false,
      reason: 'insufficient_context',
      communicationUnitId: null,
    });

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  test('records under-review communication unit with normalized identifiers', async () => {
    const { orderRepository, prismaMock } = await loadOrderRepository();

    await expect(orderRepository.recordUnderReviewCommunicationUnitFromWebhook({
      orderId: ' ord-1 ',
      currentStatus: ' Pending ',
      intendedFinalizationKey: ' idem-1 ',
      stripePaymentIntentId: ' pi-1 ',
      correlationId: 'cid-2',
    })).resolves.toEqual({
      recorded: true,
      deduped: false,
      reason: 'recorded',
      communicationUnitId: 'comm:stripe_success_emission_blocked:under_review:ord-1:idem-1:pi-1',
    });

    expect(prismaMock.orderEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: 'ord-1',
        fromStatus: 'pending',
        toStatus: 'pending',
        sourceEventId: 'comm:stripe_success_emission_blocked:under_review:ord-1:idem-1:pi-1',
        idempotencyKey: 'idem-1',
        correlationId: 'cid-2',
      }),
    });
  });

  test.each([
    [{ code: 'P2002', meta: { target: ['source_event_id'] } }],
    [{ code: 'P2002' }],
  ])('dedupes under-review communication unit writes on unique conflicts: %j', async (errorShape) => {
    const { orderRepository, prismaMock } = await loadOrderRepository();
    const err = Object.assign(new Error('duplicate under-review event'), errorShape);
    prismaMock.orderEvent.create.mockRejectedValueOnce(err);

    await expect(orderRepository.recordUnderReviewCommunicationUnitFromWebhook({
      orderId: 'ord-1',
      currentStatus: 'pending',
      intendedFinalizationKey: 'idem-1',
      stripePaymentIntentId: 'pi-1',
    })).resolves.toEqual({
      recorded: false,
      deduped: true,
      reason: 'duplicate_communication_unit',
      communicationUnitId: 'comm:stripe_success_emission_blocked:under_review:ord-1:idem-1:pi-1',
    });
  });

  test('normalizes non-duplicate under-review write failures', async () => {
    const { orderRepository, prismaMock, normalizeDbError } = await loadOrderRepository();
    const err = Object.assign(new Error('unexpected under-review insert failure'), { code: 'P5000' });
    prismaMock.orderEvent.create.mockRejectedValueOnce(err);

    await expect(orderRepository.recordUnderReviewCommunicationUnitFromWebhook({
      orderId: 'ord-1',
      currentStatus: 'pending',
      intendedFinalizationKey: 'idem-1',
      stripePaymentIntentId: 'pi-1',
    })).rejects.toThrow(err);

    expect(normalizeDbError).toHaveBeenCalledWith(err, {
      repository: 'order',
      operation: 'recordUnderReviewCommunicationUnitFromWebhook',
    });
  });
});
