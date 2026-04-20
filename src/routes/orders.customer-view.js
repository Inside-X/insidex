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

export default toCustomerOrderListEntry;
