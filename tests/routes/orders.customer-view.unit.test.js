import { toCustomerOrderDetailEntry, toCustomerOrderListEntry } from '../../src/routes/orders.customer-view.js';

describe('orders.customer-view mapping', () => {
  test('maps readiness and fulfillment mode labels for pickup', () => {
    const mapped = toCustomerOrderListEntry({
      id: 'ord-1',
      createdAt: '2026-04-17T10:00:00.000Z',
      status: 'paid',
      fulfillmentMode: 'pickup_local',
      fulfillmentSnapshot: { mode: 'pickup_local', readiness: { state: 'ready_for_pickup' } },
      totalAmount: '149.90',
      items: [{ quantity: 2, product: { name: 'Inside X Kit' } }],
    });

    expect(mapped.status).toEqual({ code: 'ready', label: 'Ready for pickup', degraded: false });
    expect(mapped.fulfillmentMode).toEqual({ code: 'pickup_local', label: 'Local pickup' });
    expect(mapped.itemSummary).toEqual({ count: 2, text: 'Inside X Kit + 1 more' });
    expect(mapped.degraded).toBe(false);
  });

  test('maps completion for delivery and fallback item summary when names unavailable', () => {
    const mapped = toCustomerOrderListEntry({
      id: 'ord-2',
      createdAt: '2026-04-17T11:00:00.000Z',
      status: 'paid',
      fulfillmentMode: 'delivery_local',
      fulfillmentSnapshot: { mode: 'delivery_local', completion: { state: 'delivered_local' } },
      totalAmount: '49.90',
      items: [{ quantity: 3, product: { name: '   ' } }],
    });

    expect(mapped.status).toEqual({ code: 'completed', label: 'Completed', degraded: false });
    expect(mapped.itemSummary).toEqual({ count: 3, text: '3 items' });
    expect(mapped.degraded).toBe(true);
  });

  test('maps pending and unknown fulfillment mode to degraded customer-safe fallback', () => {
    const mapped = toCustomerOrderListEntry({
      id: 'ord-3',
      createdAt: '2026-04-17T12:00:00.000Z',
      status: 'pending',
      fulfillmentMode: 'unexpected_mode',
      fulfillmentSnapshot: {},
      totalAmount: '19.90',
      items: [],
    });

    expect(mapped.status).toEqual({ code: 'pending_confirmation', label: 'Order received / pending confirmation', degraded: false });
    expect(mapped.fulfillmentMode).toEqual({ code: 'unexpected_mode', label: 'Fulfillment update' });
    expect(mapped.itemSummary).toEqual({ count: 0, text: 'Item details unavailable' });
    expect(mapped.degraded).toBe(true);
  });

  test('maps unknown status to under-review without leaking internal labels', () => {
    const mapped = toCustomerOrderListEntry({
      id: 'ord-4',
      createdAt: '2026-04-17T13:00:00.000Z',
      status: 'shipped',
      fulfillmentMode: 'delivery_local',
      fulfillmentSnapshot: {},
      totalAmount: '89.90',
      items: [{ quantity: 1, product: { name: 'Flow Sensor' } }],
    });

    expect(mapped.status).toEqual({ code: 'under_review', label: 'Update in progress', degraded: true });
    expect(mapped.status.label).not.toBe('shipped');
    expect(mapped.itemSummary).toEqual({ count: 1, text: 'Flow Sensor' });
  });

  test('maps cancelled explicitly and preserves mode unknown fallback code', () => {
    const mapped = toCustomerOrderListEntry({
      id: 'ord-5',
      createdAt: '2026-04-17T14:00:00.000Z',
      status: 'cancelled',
      fulfillmentMode: '',
      fulfillmentSnapshot: {},
      totalAmount: '0.00',
      items: [{ quantity: 1, product: { name: 'Adapter' } }],
    });

    expect(mapped.status).toEqual({ code: 'cancelled', label: 'Cancelled', degraded: false });
    expect(mapped.fulfillmentMode).toEqual({ code: 'unknown', label: 'Fulfillment update' });
    expect(mapped.degraded).toBe(true);
  });
  test('maps pickup completion to completed', () => {
    const mapped = toCustomerOrderListEntry({
      id: 'ord-6',
      createdAt: '2026-04-20T14:10:00.000Z',
      status: 'paid',
      fulfillmentMode: 'pickup_local',
      fulfillmentSnapshot: { completion: { state: 'collected' } },
      totalAmount: '39.90',
      items: [{ quantity: 1, product: { name: 'Starter Kit' } }],
    });

    expect(mapped.status).toEqual({ code: 'completed', label: 'Completed', degraded: false });
    expect(mapped.degraded).toBe(false);
  });

  test('maps delivery readiness to ready for local delivery', () => {
    const mapped = toCustomerOrderListEntry({
      id: 'ord-7',
      createdAt: '2026-04-20T14:20:00.000Z',
      status: 'paid',
      fulfillmentMode: 'delivery_local',
      fulfillmentSnapshot: { readiness: { state: 'ready_for_local_delivery' } },
      totalAmount: '59.90',
      items: [{ quantity: 2, product: { name: 'Flow Sensor' } }],
    });

    expect(mapped.status).toEqual({ code: 'ready', label: 'Ready for local delivery', degraded: false });
    expect(mapped.degraded).toBe(false);
  });

  test('maps paid fallback when fulfillment inputs are structurally missing', () => {
    const mapped = toCustomerOrderListEntry({
      id: 'ord-8',
      createdAt: '2026-04-20T14:30:00.000Z',
      status: 'paid',
      fulfillmentMode: null,
      fulfillmentSnapshot: null,
      totalAmount: '109.90',
      items: [{ quantity: 1, product: { name: 'Inside X Kit' } }],
    });

    expect(mapped.status).toEqual({ code: 'confirmed', label: 'Confirmed', degraded: false });
    expect(mapped.fulfillmentMode).toEqual({ code: 'unknown', label: 'Fulfillment update' });
    expect(mapped.degraded).toBe(true);
  });
});

describe('orders.customer-view detail mapping', () => {
  test('maps customer-safe detail hierarchy with payment/readiness/completion separation', () => {
    const mapped = toCustomerOrderDetailEntry({
      id: 'ord-detail-1',
      createdAt: '2026-04-20T15:10:00.000Z',
      status: 'paid',
      fulfillmentMode: 'delivery_local',
      fulfillmentSnapshot: {
        mode: 'delivery_local',
        readiness: { state: 'ready_for_local_delivery' },
        completion: { state: 'delivered_local' },
        delivery: { destination: { line1: '10 Rue du Port', postalCode: '97600', city: 'Mamoudzou' } },
      },
      totalAmount: '179.90',
      items: [{ quantity: 2, unitPrice: '89.95', product: { name: 'Inside X Kit' } }],
    });

    expect(mapped.status).toEqual({ code: 'completed', label: 'Completed', degraded: false });
    expect(mapped.fulfillmentMode).toEqual({ code: 'delivery_local', label: 'Local delivery' });
    expect(mapped.payment).toEqual({ code: 'payment_confirmed', label: 'Payment confirmed' });
    expect(mapped.readiness).toEqual({ label: 'Ready for local delivery' });
    expect(mapped.completion).toEqual({ label: 'Delivered locally' });
    expect(mapped.items).toEqual([{ name: 'Inside X Kit', quantity: 2, unitPrice: '89.95', lineTotal: '179.9' }]);
    expect(mapped.degraded).toBe(false);
  });

  test('degrades unknown/internal states without leaking internal wording', () => {
    const mapped = toCustomerOrderDetailEntry({
      id: 'ord-detail-2',
      createdAt: '2026-04-20T15:20:00.000Z',
      status: 'triage_internal',
      fulfillmentMode: 'pickup_local',
      fulfillmentSnapshot: {
        operator: { note: 'manual_remediation_required' },
      },
      totalAmount: '39.90',
      items: [{ quantity: 1, unitPrice: '39.90', product: { name: 'Adapter' } }],
    });

    expect(mapped.status).toEqual({ code: 'under_review', label: 'Update in progress', degraded: true });
    expect(JSON.stringify(mapped)).not.toContain('triage_internal');
    expect(JSON.stringify(mapped)).not.toContain('manual_remediation_required');
    expect(mapped.contextual.nextStep).toBe('Your order is under review. We will share an update soon.');
  });

  test('maps payment pending and pickup contextual next-step without fabricated completion', () => {
    const mapped = toCustomerOrderDetailEntry({
      id: 'ord-detail-3',
      createdAt: '2026-04-20T15:30:00.000Z',
      status: 'pending',
      fulfillmentMode: 'pickup_local',
      fulfillmentSnapshot: {
        mode: 'pickup_local',
      },
      totalAmount: '19.90',
      items: [{ quantity: 1, unitPrice: '19.90', product: { name: 'Adapter' } }],
    });

    expect(mapped.payment).toEqual({ code: 'payment_pending', label: 'Payment confirmation in progress' });
    expect(mapped.contextual.nextStep).toBe('We are confirming your order. No action is needed right now.');
    expect(mapped.completion).toBeNull();
    expect(mapped.readiness).toBeNull();
    expect(mapped.fulfillmentDetails.modeNote).toBe('Pickup at the selected local point');
  });

  test('maps delivery dispatch context only when dispatch truth is present', () => {
    const mapped = toCustomerOrderDetailEntry({
      id: 'ord-detail-4',
      createdAt: '2026-04-20T15:40:00.000Z',
      status: 'paid',
      fulfillmentMode: 'delivery_local',
      fulfillmentSnapshot: {
        mode: 'delivery_local',
        dispatch: { state: 'in_motion_local' },
        delivery: { destination: { line1: '1 Avenue du Centre', line2: 'Bât A', postalCode: '97600', city: 'Mamoudzou' } },
      },
      totalAmount: '59.90',
      items: [{ quantity: 1, unitPrice: '59.90', product: { name: 'Flow Sensor' } }],
    });

    expect(mapped.contextual.dispatch).toBe('Local delivery is in motion');
    expect(mapped.fulfillmentDetails.modeNote).toContain('Bât A');
    expect(mapped.degraded).toBe(false);
  });

  test('maps cancelled payment and degraded delivery details when destination is unavailable', () => {
    const mapped = toCustomerOrderDetailEntry({
      id: 'ord-detail-5',
      createdAt: '2026-04-20T15:50:00.000Z',
      status: 'cancelled',
      fulfillmentMode: 'delivery_local',
      fulfillmentSnapshot: { mode: 'delivery_local', delivery: {} },
      totalAmount: '0.00',
      items: [{ quantity: 0, unitPrice: null, product: { name: '   ' } }],
    });

    expect(mapped.payment).toEqual({ code: 'payment_not_completed', label: 'Payment was not completed for this order' });
    expect(mapped.fulfillmentDetails.modeNote).toBe('Local delivery details are currently limited');
    expect(mapped.degraded).toBe(true);
    expect(mapped.contextual.degradedNotice).toBe('Some order details are currently limited.');
  });
});
