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

const CONFIRMED_CLASS = Object.freeze({
  key: 'confirmed',
  sourceEventPrefix: 'comm.confirmed.order',
  pendingSupersessionPrefix: 'comm.pending_confirmation.superseded_by_confirmed.order',
  underReviewSupersessionPrefix: 'comm.under_review.superseded_by_confirmed.order',
});
const READY_CLASS = Object.freeze({
  key: 'ready',
  sourceEventPrefix: 'comm.ready.order',
  pendingSupersessionPrefix: 'comm.pending_confirmation.superseded_by_ready.order',
  underReviewSupersessionPrefix: 'comm.under_review.superseded_by_ready.order',
  confirmedSupersessionPrefix: 'comm.confirmed.superseded_by_ready.order',
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

function buildConfirmedCustomerSafeRepresentation(order) {
  return {
    classKey: CONFIRMED_CLASS.key,
    orderId: order.id,
    subject: `Order ${order.id} confirmed`,
    summary: 'Your order is confirmed.',
    nextStep: 'No action is needed right now. Check your account order detail for the latest update.',
  };
}

function buildReadyCustomerSafeRepresentation(order) {
  const customerView = toCustomerOrderDetailEntry(order);
  const statusCode = customerView?.status?.code;
  const statusLabel = customerView?.status?.label;

  if (statusCode === 'ready' && statusLabel === 'Ready for pickup') {
    return {
      classKey: READY_CLASS.key,
      orderId: order.id,
      subject: `Order ${order.id} ready for pickup`,
      summary: 'Your order is ready for pickup.',
      actionRequiredNow: true,
      nextStep: 'Please follow your local pickup process. Check your account order detail for the latest update.',
    };
  }

  if (statusCode === 'ready' && statusLabel === 'Ready for local delivery') {
    return {
      classKey: READY_CLASS.key,
      orderId: order.id,
      subject: `Order ${order.id} ready for local delivery`,
      summary: 'Your order is ready for local delivery.',
      actionRequiredNow: false,
      nextStep: 'No action is needed right now. Check your account order detail for the latest update.',
    };
  }

  return null;
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

export async function createConfirmedCommunicationIntent({
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

  if (!order || order.status !== 'paid') {
    return classifySuppression('stronger_or_missing_truth');
  }

  const customerView = toCustomerOrderDetailEntry(order);
  if (customerView?.status?.code !== 'confirmed') {
    return classifySuppression('stronger_or_missing_truth');
  }

  const sourceEventId = buildUnitId(CONFIRMED_CLASS.sourceEventPrefix, order.id);
  const pendingSupersessionEventId = buildUnitId(CONFIRMED_CLASS.pendingSupersessionPrefix, order.id);
  const underReviewSupersessionEventId = buildUnitId(CONFIRMED_CLASS.underReviewSupersessionPrefix, order.id);

  try {
    const recorded = await repository.recordConfirmedCommunicationIntent({
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

    if (typeof repository.recordPendingConfirmationSupersessionByConfirmed === 'function') {
      const pendingSupersession = await repository.recordPendingConfirmationSupersessionByConfirmed({
        orderId: order.id,
        sourceEventId: pendingSupersessionEventId,
        correlationId,
        orderStatus: order.status,
      });

      if (pendingSupersession?.ok !== true) {
        return classifySuppression('pending_supersession_uncertain', {
          sourceEventId,
          pendingSupersessionEventId,
          underReviewSupersessionEventId,
        });
      }
    }

    if (typeof repository.recordUnderReviewSupersessionByConfirmed === 'function') {
      const underReviewSupersession = await repository.recordUnderReviewSupersessionByConfirmed({
        orderId: order.id,
        sourceEventId: underReviewSupersessionEventId,
        correlationId,
        orderStatus: order.status,
      });

      if (underReviewSupersession?.ok !== true) {
        return classifySuppression('under_review_supersession_uncertain', {
          sourceEventId,
          pendingSupersessionEventId,
          underReviewSupersessionEventId,
        });
      }
    }

    return {
      ok: true,
      outcome: 'created',
      sourceEventId,
      pendingSupersessionEventId,
      underReviewSupersessionEventId,
      representation: buildConfirmedCustomerSafeRepresentation(order),
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

export async function createReadyCommunicationIntent({
  orderId,
  correlationId = null,
  repository = orderRepository,
  authoritativeOrder = null,
} = {}) {
  if (!orderId || typeof orderId !== 'string') {
    return classifySuppression('missing_order_reference');
  }

  let order = authoritativeOrder;
  if (!order || order?.id !== orderId) {
    try {
      order = await repository.findById(orderId);
    } catch (error) {
      if (isDependencyUnavailableError(error)) {
        return classifySuppression('dependency_unavailable');
      }
      return classifySuppression('truth_unavailable');
    }
  }

  if (!order || order.status !== 'paid') {
    return classifySuppression('stronger_or_missing_truth');
  }

  const customerView = toCustomerOrderDetailEntry(order);
  if (customerView?.status?.code !== 'ready') {
    return classifySuppression('stronger_or_missing_truth');
  }

  const representation = buildReadyCustomerSafeRepresentation(order);
  if (!representation) {
    return classifySuppression('semantic_contradiction');
  }

  const sourceEventId = buildUnitId(READY_CLASS.sourceEventPrefix, order.id);
  const pendingSupersessionEventId = buildUnitId(READY_CLASS.pendingSupersessionPrefix, order.id);
  const underReviewSupersessionEventId = buildUnitId(READY_CLASS.underReviewSupersessionPrefix, order.id);
  const confirmedSupersessionEventId = buildUnitId(READY_CLASS.confirmedSupersessionPrefix, order.id);

  try {
    const recorded = await repository.recordReadyCommunicationIntent({
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

    if (typeof repository.recordPendingConfirmationSupersessionByReady === 'function') {
      const pendingSupersession = await repository.recordPendingConfirmationSupersessionByReady({
        orderId: order.id,
        sourceEventId: pendingSupersessionEventId,
        correlationId,
        orderStatus: order.status,
      });

      if (pendingSupersession?.ok !== true) {
        return classifySuppression('pending_supersession_uncertain', {
          sourceEventId,
          pendingSupersessionEventId,
          underReviewSupersessionEventId,
          confirmedSupersessionEventId,
        });
      }
    }

    if (typeof repository.recordUnderReviewSupersessionByReady === 'function') {
      const underReviewSupersession = await repository.recordUnderReviewSupersessionByReady({
        orderId: order.id,
        sourceEventId: underReviewSupersessionEventId,
        correlationId,
        orderStatus: order.status,
      });

      if (underReviewSupersession?.ok !== true) {
        return classifySuppression('under_review_supersession_uncertain', {
          sourceEventId,
          pendingSupersessionEventId,
          underReviewSupersessionEventId,
          confirmedSupersessionEventId,
        });
      }
    }

    if (typeof repository.recordConfirmedSupersessionByReady === 'function') {
      const confirmedSupersession = await repository.recordConfirmedSupersessionByReady({
        orderId: order.id,
        sourceEventId: confirmedSupersessionEventId,
        correlationId,
        orderStatus: order.status,
      });

      if (confirmedSupersession?.ok !== true) {
        return classifySuppression('confirmed_supersession_uncertain', {
          sourceEventId,
          pendingSupersessionEventId,
          underReviewSupersessionEventId,
          confirmedSupersessionEventId,
        });
      }
    }

    return {
      ok: true,
      outcome: 'created',
      sourceEventId,
      pendingSupersessionEventId,
      underReviewSupersessionEventId,
      confirmedSupersessionEventId,
      representation,
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
