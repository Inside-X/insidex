function normalizeFulfillmentModeLabel(mode) {
  if (mode === 'pickup_local') return 'Local pickup';
  if (mode === 'delivery_local') return 'Local delivery';
  return 'Fulfillment update';
}

function compactItemSummary(items = []) {
  const safeItems = Array.isArray(items) ? items : [];
  const totalQuantity = safeItems.reduce((sum, item) => {
    const qty = Number.isInteger(item?.quantity) ? item.quantity : 0;
    return sum + Math.max(0, qty);
  }, 0);

  if (totalQuantity <= 0) {
    return {
      count: 0,
      text: 'Item details unavailable',
      degraded: true,
    };
  }

  const firstNamedItem = safeItems.find((item) => typeof item?.product?.name === 'string' && item.product.name.trim());
  if (!firstNamedItem) {
    return {
      count: totalQuantity,
      text: `${totalQuantity} item${totalQuantity > 1 ? 's' : ''}`,
      degraded: true,
    };
  }

  const firstName = firstNamedItem.product.name.trim();
  if (totalQuantity === 1) {
    return {
      count: 1,
      text: firstName,
      degraded: false,
    };
  }

  return {
    count: totalQuantity,
    text: `${firstName} + ${totalQuantity - 1} more`,
    degraded: false,
  };
}

function deriveCustomerStatus(order) {
  const snapshot = order?.fulfillmentSnapshot && typeof order.fulfillmentSnapshot === 'object'
    ? order.fulfillmentSnapshot
    : {};
  const mode = typeof order?.fulfillmentMode === 'string' ? order.fulfillmentMode.trim() : '';
  const readinessState = typeof snapshot?.readiness?.state === 'string' ? snapshot.readiness.state.trim() : '';
  const completionState = typeof snapshot?.completion?.state === 'string' ? snapshot.completion.state.trim() : '';

  if (order?.status === 'cancelled') {
    return { code: 'cancelled', label: 'Cancelled', degraded: false };
  }

  if (mode === 'pickup_local' && completionState === 'collected') {
    return { code: 'completed', label: 'Completed', degraded: false };
  }
  if (mode === 'delivery_local' && completionState === 'delivered_local') {
    return { code: 'completed', label: 'Completed', degraded: false };
  }

  if (mode === 'pickup_local' && readinessState === 'ready_for_pickup') {
    return { code: 'ready', label: 'Ready for pickup', degraded: false };
  }
  if (mode === 'delivery_local' && readinessState === 'ready_for_local_delivery') {
    return { code: 'ready', label: 'Ready for local delivery', degraded: false };
  }

  if (order?.status === 'paid') {
    return { code: 'confirmed', label: 'Confirmed', degraded: false };
  }
  if (order?.status === 'pending') {
    return { code: 'pending_confirmation', label: 'Order received / pending confirmation', degraded: false };
  }

  return { code: 'under_review', label: 'Update in progress', degraded: true };
}

function normalizeItemDetail(item = {}) {
  const quantity = Number.isInteger(item?.quantity) ? Math.max(0, item.quantity) : 0;
  const productName = typeof item?.product?.name === 'string' && item.product.name.trim()
    ? item.product.name.trim()
    : 'Item details unavailable';

  const unitPrice = item?.unitPrice == null ? null : String(item.unitPrice);

  return {
    name: productName,
    quantity,
    unitPrice,
    lineTotal: unitPrice == null ? null : String(Number(unitPrice) * quantity),
    degraded: productName === 'Item details unavailable' || quantity <= 0 || unitPrice == null,
  };
}

function derivePaymentSummary(order) {
  if (order?.status === 'paid') {
    return { code: 'payment_confirmed', label: 'Payment confirmed' };
  }

  if (order?.status === 'pending') {
    return { code: 'payment_pending', label: 'Payment confirmation in progress' };
  }

  if (order?.status === 'cancelled') {
    return { code: 'payment_not_completed', label: 'Payment was not completed for this order' };
  }

  return { code: 'payment_limited', label: 'Payment details are currently limited' };
}

function deriveReadinessLabel({ mode, snapshot }) {
  const readinessState = typeof snapshot?.readiness?.state === 'string' ? snapshot.readiness.state.trim() : '';
  if (mode === 'pickup_local' && readinessState === 'ready_for_pickup') {
    return 'Ready for pickup';
  }
  if (mode === 'delivery_local' && readinessState === 'ready_for_local_delivery') {
    return 'Ready for local delivery';
  }
  return null;
}

function deriveCompletionLabel({ mode, snapshot }) {
  const completionState = typeof snapshot?.completion?.state === 'string' ? snapshot.completion.state.trim() : '';
  if (mode === 'pickup_local' && completionState === 'collected') {
    return 'Collected';
  }
  if (mode === 'delivery_local' && completionState === 'delivered_local') {
    return 'Delivered locally';
  }
  return null;
}

function deriveDispatchLabel({ mode, snapshot }) {
  if (mode !== 'delivery_local') return null;
  const state = typeof snapshot?.dispatch?.state === 'string' ? snapshot.dispatch.state.trim() : '';
  if (state === 'dispatch_started_local') return 'Local delivery is on the way';
  if (state === 'in_motion_local') return 'Local delivery is in motion';
  return null;
}

function deriveFulfillmentDetails({ mode, snapshot }) {
  if (mode === 'pickup_local') {
    return {
      modeNote: 'Pickup at the selected local point',
    };
  }

  if (mode === 'delivery_local') {
    const destination = snapshot?.delivery?.destination && typeof snapshot.delivery.destination === 'object'
      ? snapshot.delivery.destination
      : null;

    if (!destination?.line1 || !destination?.city || !destination?.postalCode) {
      return { modeNote: 'Local delivery details are currently limited', degraded: true };
    }

    const line2 = destination?.line2 ? `, ${destination.line2}` : '';
    return {
      modeNote: `Delivery to ${destination.line1}${line2}, ${destination.postalCode} ${destination.city}`,
      degraded: false,
    };
  }

  return { modeNote: 'Fulfillment details are currently limited', degraded: true };
}

export function toCustomerOrderListEntry(order) {
  const status = deriveCustomerStatus(order);
  const summary = compactItemSummary(order?.items);
  const fulfillmentMode = typeof order?.fulfillmentMode === 'string' ? order.fulfillmentMode.trim() : '';

  return {
    orderId: order.id,
    orderDate: order.createdAt,
    status,
    fulfillmentMode: {
      code: fulfillmentMode || 'unknown',
      label: normalizeFulfillmentModeLabel(fulfillmentMode),
    },
    itemSummary: {
      count: summary.count,
      text: summary.text,
    },
    totalAmount: order.totalAmount,
    currency: 'EUR',
    degraded: status.degraded || summary.degraded || !fulfillmentMode,
  };
}

export function toCustomerOrderDetailEntry(order) {
  const status = deriveCustomerStatus(order);
  const fulfillmentMode = typeof order?.fulfillmentMode === 'string' ? order.fulfillmentMode.trim() : '';
  const snapshot = order?.fulfillmentSnapshot && typeof order.fulfillmentSnapshot === 'object'
    ? order.fulfillmentSnapshot
    : {};
  const items = Array.isArray(order?.items) ? order.items.map(normalizeItemDetail) : [];
  const payment = derivePaymentSummary(order);
  const readinessLabel = deriveReadinessLabel({ mode: fulfillmentMode, snapshot });
  const completionLabel = deriveCompletionLabel({ mode: fulfillmentMode, snapshot });
  const dispatchLabel = deriveDispatchLabel({ mode: fulfillmentMode, snapshot });
  const fulfillmentDetails = deriveFulfillmentDetails({ mode: fulfillmentMode, snapshot });

  const degraded = status.degraded
    || items.some((item) => item.degraded)
    || fulfillmentDetails.degraded === true
    || !fulfillmentMode;

  const contextual = {
    ...(status.code === 'pending_confirmation' ? { nextStep: 'We are confirming your order. No action is needed right now.' } : {}),
    ...(status.code === 'under_review' ? { nextStep: 'Your order is under review. We will share an update soon.' } : {}),
    ...(dispatchLabel ? { dispatch: dispatchLabel } : {}),
    ...(degraded ? { degradedNotice: 'Some order details are currently limited.' } : {}),
  };

  return {
    orderId: order.id,
    orderDate: order.createdAt,
    status,
    fulfillmentMode: {
      code: fulfillmentMode || 'unknown',
      label: normalizeFulfillmentModeLabel(fulfillmentMode),
    },
    payment,
    totals: {
      totalAmount: order?.totalAmount == null ? null : String(order.totalAmount),
      currency: 'EUR',
    },
    items: items.map(({ degraded: _degraded, ...safeItem }) => safeItem),
    readiness: readinessLabel ? { label: readinessLabel } : null,
    completion: completionLabel ? { label: completionLabel } : null,
    fulfillmentDetails: {
      modeNote: fulfillmentDetails.modeNote,
    },
    contextual,
    degraded,
  };
}

export default toCustomerOrderListEntry;
