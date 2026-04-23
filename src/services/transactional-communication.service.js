import { isDependencyUnavailableError } from '../lib/critical-dependencies.js';
import { orderRepository } from '../repositories/order.repository.js';
import { toCustomerOrderDetailEntry } from '../routes/orders.customer-view.js';

const FIRST_CLASS = Object.freeze({
  key: 'order_received_pending_confirmation',
  sourceEventPrefix: 'comm.pending_confirmation.order',
});

function buildUnitId(orderId) {
  return `${FIRST_CLASS.sourceEventPrefix}:${orderId}`;
}

function buildCustomerSafeRepresentation(order) {
  return {
    classKey: FIRST_CLASS.key,
    orderId: order.id,
    subject: `Order ${order.id} received`,
    summary: 'We received your order. Confirmation is still pending.',
    nextStep: 'No action is needed right now. Check your account order detail for the latest update.',
  };
}

function classifySuppression(reason, context = {}) {
  return {
    ok: false,
    outcome: 'suppressed',
    reason,
    ...context,
  };
}

export async function createPendingConfirmationCommunicationIntent({
  orderId,
  correlationId = null,
  repository = orderRepository,
} = {}) {
  if (!orderId || typeof orderId !== 'string') {
    return classifySuppression('missing_order_reference');
  }

  let order;
  try {
    order = await repository.findById(orderId);
  } catch (error) {
    if (isDependencyUnavailableError(error)) {
      return classifySuppression('dependency_unavailable');
    }
    return classifySuppression('truth_unavailable');
  }

  if (!order || order.status !== 'pending') {
    return classifySuppression('stronger_or_missing_truth');
  }

  const customerView = toCustomerOrderDetailEntry(order);
  if (customerView?.status?.code !== 'pending_confirmation') {
    return classifySuppression('semantic_contradiction');
  }

  const sourceEventId = buildUnitId(order.id);

  try {
    const recorded = await repository.recordPendingConfirmationCommunicationIntent({
      orderId: order.id,
      sourceEventId,
      correlationId,
      orderStatus: order.status,
    });

    if (recorded.duplicate === true) {
      return classifySuppression('duplicate_semantic_intent', {
        sourceEventId,
      });
    }

    return {
      ok: true,
      outcome: 'created',
      sourceEventId,
      representation: buildCustomerSafeRepresentation(order),
    };
  } catch (error) {
    if (isDependencyUnavailableError(error)) {
      return classifySuppression('dependency_unavailable', {
        sourceEventId,
      });
    }
    return classifySuppression('intent_recording_failed', {
      sourceEventId,
    });
  }
}

export default createPendingConfirmationCommunicationIntent;
