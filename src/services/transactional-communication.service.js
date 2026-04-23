import { isDependencyUnavailableError } from '../lib/critical-dependencies.js';
import { orderRepository } from '../repositories/order.repository.js';
import { toCustomerOrderDetailEntry } from '../routes/orders.customer-view.js';

const PENDING_CONFIRMATION_CLASS = Object.freeze({
  key: 'order_received_pending_confirmation',
  sourceEventPrefix: 'comm.pending_confirmation.order',
});

const UNDER_REVIEW_CLASS = Object.freeze({
  key: 'under_review',
  sourceEventPrefix: 'comm.under_review.order',
  pendingSupersessionPrefix: 'comm.pending_confirmation.superseded_by_under_review.order',
});

function buildUnitId(prefix, orderId) {
  return `${prefix}:${orderId}`;
}

function buildCustomerSafeRepresentation(order) {
  return {
    classKey: PENDING_CONFIRMATION_CLASS.key,
    orderId: order.id,
    subject: `Order ${order.id} received`,
    summary: 'We received your order. Confirmation is still pending.',
    nextStep: 'No action is needed right now. Check your account order detail for the latest update.',
  };
}

function buildUnderReviewCustomerSafeRepresentation(order) {
  return {
    classKey: UNDER_REVIEW_CLASS.key,
    orderId: order.id,
    subject: `Order ${order.id} is under review`,
    summary: 'Your order is under review right now.',
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

  const sourceEventId = buildUnitId(PENDING_CONFIRMATION_CLASS.sourceEventPrefix, order.id);

  try {
    if (typeof repository.hasUnderReviewCommunicationIntent === 'function') {
      const superseded = await repository.hasUnderReviewCommunicationIntent({
        orderId: order.id,
      });
      if (superseded === true) {
        return classifySuppression('superseded_by_under_review_truth', { sourceEventId });
      }
    }

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

export async function createUnderReviewCommunicationIntent({
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

  if (!order) {
    return classifySuppression('stronger_or_missing_truth');
  }

  const customerView = toCustomerOrderDetailEntry(order);
  if (customerView?.status?.code !== 'under_review') {
    return classifySuppression('stronger_or_missing_truth');
  }

  const sourceEventId = buildUnitId(UNDER_REVIEW_CLASS.sourceEventPrefix, order.id);
  const pendingSupersessionEventId = buildUnitId(UNDER_REVIEW_CLASS.pendingSupersessionPrefix, order.id);

  try {
    const recorded = await repository.recordUnderReviewCommunicationIntent({
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

    if (typeof repository.recordPendingConfirmationSupersession === 'function') {
      const supersession = await repository.recordPendingConfirmationSupersession({
        orderId: order.id,
        sourceEventId: pendingSupersessionEventId,
        correlationId,
        orderStatus: order.status,
      });

      if (supersession?.ok !== true) {
        return classifySuppression('pending_supersession_uncertain', {
          sourceEventId,
          pendingSupersessionEventId,
        });
      }
    }

    return {
      ok: true,
      outcome: 'created',
      sourceEventId,
      pendingSupersessionEventId,
      representation: buildUnderReviewCustomerSafeRepresentation(order),
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
