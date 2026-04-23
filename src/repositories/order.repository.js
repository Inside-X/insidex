import prisma from '../lib/prisma.js';
import { normalizeDbError } from '../lib/db-error.js';
import { fromMinorUnits, multiplyMinorUnits, sumMinorUnits, toMinorUnits } from '../utils/minor-units.js';
import { assertValidTransition } from '../domain/order-state-machine.js';

function uniqueProductItems(items) {
  const byProduct = new Map();
  for (const item of items) {
    const previous = byProduct.get(item.productId) || 0;
    byProduct.set(item.productId, previous + item.quantity);
  }

  return [...byProduct.entries()]
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((a, b) => a.productId.localeCompare(b.productId));
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function normalizeDestination(destination) {
  if (!destination || typeof destination !== 'object') {
    throw badRequest('delivery_local requires destination truth');
  }

  const line1 = String(destination.line1 || '').trim();
  const city = String(destination.city || '').trim();
  const postalCode = String(destination.postalCode || '').trim();
  const country = String(destination.country || '').trim();
  const line2 = destination.line2 == null ? undefined : String(destination.line2).trim();

  if (!line1 || !city || !postalCode || !country) {
    throw badRequest('delivery_local requires non-ambiguous destination truth');
  }

  return {
    line1,
    ...(line2 ? { line2 } : {}),
    city,
    postalCode,
    country,
  };
}

function destinationsAreEquivalent(left, right) {
  const leftLine2 = left.line2 || '';
  const rightLine2 = right.line2 || '';
  return left.line1 === right.line1
    && left.city === right.city
    && left.postalCode === right.postalCode
    && left.country === right.country
    && leftLine2 === rightLine2;
}

function buildFulfillmentSnapshot({ fulfillment, email, address }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (!fulfillment || typeof fulfillment !== 'object') {
    throw badRequest('fulfillment selection is required');
  }

  const mode = fulfillment?.mode;
  if (mode !== 'pickup_local' && mode !== 'delivery_local') {
    throw badRequest('Unsupported fulfillment mode');
  }

  if (!normalizedEmail) {
    throw badRequest('Customer email is required for fulfillment snapshot');
  }

  const baseSnapshot = {
    mode,
    customer: {
      contactEmail: normalizedEmail,
    },
  };

  if (mode === 'pickup_local') {
    const note = fulfillment?.pickup?.note;
    return {
      ...baseSnapshot,
      pickup: {
        ...(note ? { note: String(note).trim() } : {}),
      },
    };
  }

  if (fulfillment?.pickup) {
    throw badRequest('pickup payload is incompatible with delivery_local');
  }

  const deliveryDestination = fulfillment?.delivery?.destination;
  if (!deliveryDestination && !address) {
    throw badRequest('delivery_local requires destination truth');
  }
  const destination = normalizeDestination(deliveryDestination || address);
  if (deliveryDestination && address) {
    const normalizedAddress = normalizeDestination(address);
    if (!destinationsAreEquivalent(destination, normalizedAddress)) {
      throw badRequest('delivery_local destination/address mismatch is ambiguous');
    }
  }

  const note = fulfillment?.delivery?.note;

  return {
    ...baseSnapshot,
    delivery: {
      destination,
      ...(note ? { note: String(note).trim() } : {}),
    },
  };
}

function expectedReadinessForMode(mode) {
  if (mode === 'pickup_local') return 'ready_for_pickup';
  if (mode === 'delivery_local') return 'ready_for_local_delivery';
  return null;
}

function expectedCompletionForMode(mode) {
  if (mode === 'pickup_local') return 'collected';
  if (mode === 'delivery_local') return 'delivered_local';
  return null;
}

function sanitizeReadinessNote(note) {
  if (note == null) return undefined;
  const normalized = String(note).trim();
  return normalized || undefined;
}

function assertExpectedAmountMatches({ expectedTotalAmount, expectedTotalAmountMinor, totalAmountMinor, currency = 'EUR' }) {
  if (expectedTotalAmountMinor !== undefined && expectedTotalAmountMinor !== null) {
    if (!Number.isInteger(expectedTotalAmountMinor) || expectedTotalAmountMinor < 0) {
      const error = new Error('Invalid expected total amount');
      error.statusCode = 400;
      throw error;
    }

    if (expectedTotalAmountMinor !== totalAmountMinor) {
      const error = new Error(`Amount mismatch: expected ${expectedTotalAmountMinor}, computed ${totalAmountMinor}`);
      error.statusCode = 400;
      throw error;
    }
    return;
  }

  if (expectedTotalAmount === undefined || expectedTotalAmount === null) {
    return;
  }

  let expectedMinor;
  try {
    expectedMinor = toMinorUnits(String(expectedTotalAmount), currency);
  } catch {
    const error = new Error('Invalid expected total amount');
    error.statusCode = 400;
    throw error;
  }

  if (expectedMinor !== totalAmountMinor) {
    const error = new Error(`Amount mismatch: expected ${expectedMinor}, computed ${totalAmountMinor}`);
    error.statusCode = 400;
    throw error;
  }
}

function isUniqueConstraintOnTarget(error, targetField) {
  if (error?.code !== 'P2002') return false;
  const target = error?.meta?.target;
  if (Array.isArray(target)) return target.includes(targetField);
  if (typeof target === 'string') return target.includes(targetField);
  return false;
}

function extractWebhookResourceId({ provider, paymentIntentId = null, payload = {} }) {
  if (provider === 'stripe') {
    return paymentIntentId || payload?.data?.object?.id || null;
  }

  if (provider === 'paypal') {
    return payload?.payload?.capture?.id || payload?.payload?.resource?.id || null;
  }

  return null;
}


function resolveOrderEventSource(provider) {
  if (provider === 'stripe' || provider === 'paypal') return provider;
  return 'system';
}

function buildUnderReviewCommunicationUnitId({
  seam = '',
  semanticClass = '',
  orderId = '',
  intendedFinalizationKey = '',
  resourceId = '',
}) {
  return [
    'comm',
    seam,
    semanticClass,
    orderId,
    intendedFinalizationKey,
    resourceId,
  ].join(':');
}

async function updateOrderPaidAndRecordEvent({ tx, order, where, stripePaymentIntentId = null, provider, sourceEventId = null, correlationId = null }) {
  const fromStatus = order.status;
  const updateResult = await tx.order.updateMany({
    where,
    data: {
      status: 'paid',
      ...(stripePaymentIntentId ? { stripePaymentIntentId } : {}),
    },
  });

  if (updateResult.count !== 1) {
    return { replayed: false, orderMarkedPaid: false };
  }

  // Dedupe strategy: unique(orderId, source, sourceEventId) prevents duplicate history rows for replayed provider events.
  try {
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        type: 'status_transition',
        fromStatus,
        toStatus: 'paid',
        source: resolveOrderEventSource(provider),
        sourceEventId,
        idempotencyKey: order.idempotencyKey || null,
        correlationId,
      },
    });
  } catch (error) {
    if (isUniqueConstraintOnTarget(error, 'source_event_id') || error?.code === 'P2002') {
      return { replayed: true, orderMarkedPaid: false };
    }
    throw error;
  }

  return { replayed: false, orderMarkedPaid: true };
}

export const orderRepository = {
  async create(data) {
    try { return await prisma.order.create({ data }); } catch (error) { normalizeDbError(error, { repository: 'order', operation: 'create' }); }
  },
  async findById(id) {
    try { return await prisma.order.findUnique({ where: { id }, include: { items: true } }); } catch (error) { normalizeDbError(error, { repository: 'order', operation: 'findById' }); }
  },
  async recordPendingConfirmationCommunicationIntent({
    orderId,
    sourceEventId,
    correlationId = null,
    orderStatus = null,
  } = {}) {
    if (!orderId || typeof orderId !== 'string') {
      throw badRequest('orderId is required for communication intent');
    }
    if (!sourceEventId || typeof sourceEventId !== 'string') {
      throw badRequest('sourceEventId is required for communication intent');
    }
    if (orderStatus !== 'pending') {
      throw badRequest('pending-confirmation communication requires pending order truth');
    }

    try {
      const event = await prisma.orderEvent.create({
        data: {
          orderId,
          type: 'customer_comm_pending_confirmation_candidate',
          fromStatus: 'pending',
          toStatus: 'pending',
          source: 'system',
          sourceEventId,
          correlationId: correlationId || null,
        },
      });
      return { duplicate: false, event };
    } catch (error) {
      if (isUniqueConstraintOnTarget(error, 'source_event_id') || error?.code === 'P2002') {
        return { duplicate: true, event: null };
      }
      normalizeDbError(error, { repository: 'order', operation: 'recordPendingConfirmationCommunicationIntent' });
    }
  },
  async hasUnderReviewCommunicationIntent({ orderId } = {}) {
    if (!orderId || typeof orderId !== 'string') {
      return false;
    }

    try {
      const existing = await prisma.orderEvent.findFirst({
        where: {
          orderId,
          type: 'customer_comm_under_review_candidate',
        },
        select: { id: true },
      });
      return Boolean(existing?.id);
    } catch (error) {
      normalizeDbError(error, { repository: 'order', operation: 'hasUnderReviewCommunicationIntent' });
    }
  },
  async recordUnderReviewCommunicationIntent({
    orderId,
    sourceEventId,
    correlationId = null,
    orderStatus = null,
  } = {}) {
    if (!orderId || typeof orderId !== 'string') {
      throw badRequest('orderId is required for communication intent');
    }
    if (!sourceEventId || typeof sourceEventId !== 'string') {
      throw badRequest('sourceEventId is required for communication intent');
    }
    if (!orderStatus || ['pending', 'paid', 'cancelled'].includes(orderStatus)) {
      throw badRequest('under-review communication requires under-review order truth');
    }

    try {
      const event = await prisma.orderEvent.create({
        data: {
          orderId,
          type: 'customer_comm_under_review_candidate',
          fromStatus: orderStatus,
          toStatus: orderStatus,
          source: 'system',
          sourceEventId,
          correlationId: correlationId || null,
        },
      });
      return { duplicate: false, event };
    } catch (error) {
      if (isUniqueConstraintOnTarget(error, 'source_event_id') || error?.code === 'P2002') {
        return { duplicate: true, event: null };
      }
      normalizeDbError(error, { repository: 'order', operation: 'recordUnderReviewCommunicationIntent' });
    }
  },
  async recordPendingConfirmationSupersession({
    orderId,
    sourceEventId,
    correlationId = null,
    orderStatus = null,
  } = {}) {
    if (!orderId || typeof orderId !== 'string') {
      throw badRequest('orderId is required for pending supersession');
    }
    if (!sourceEventId || typeof sourceEventId !== 'string') {
      throw badRequest('sourceEventId is required for pending supersession');
    }
    if (!orderStatus || ['pending', 'paid', 'cancelled'].includes(orderStatus)) {
      throw badRequest('pending supersession requires under-review order truth');
    }

    try {
      await prisma.orderEvent.create({
        data: {
          orderId,
          type: 'customer_comm_pending_confirmation_superseded',
          fromStatus: 'pending',
          toStatus: orderStatus,
          source: 'system',
          sourceEventId,
          correlationId: correlationId || null,
        },
      });
      return { ok: true, duplicate: false };
    } catch (error) {
      if (isUniqueConstraintOnTarget(error, 'source_event_id') || error?.code === 'P2002') {
        return { ok: true, duplicate: true };
      }
      normalizeDbError(error, { repository: 'order', operation: 'recordPendingConfirmationSupersession' });
    }
  },
  async update(id, data) {
    try { return await prisma.order.update({ where: { id }, data }); } catch (error) { normalizeDbError(error, { repository: 'order', operation: 'update' }); }
  },
  async delete(id) {
    try { return await prisma.order.delete({ where: { id } }); } catch (error) { normalizeDbError(error, { repository: 'order', operation: 'delete' }); }
  },
  async list(params = {}) {
    const { skip = 0, take = 50, where = {}, orderBy = { createdAt: 'desc' } } = params;
    try { return await prisma.order.findMany({ skip, take, where, orderBy, include: { items: true } }); } catch (error) { normalizeDbError(error, { repository: 'order', operation: 'list' }); }
  },

  async listCustomerOrderVisibility({ userId, take = 20 } = {}) {
    const normalizedTake = Number.isInteger(take) ? Math.max(1, Math.min(50, take)) : 20;
    try {
      return await prisma.order.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: normalizedTake,
        select: {
          id: true,
          userId: true,
          createdAt: true,
          status: true,
          fulfillmentMode: true,
          fulfillmentSnapshot: true,
          totalAmount: true,
          items: {
            select: {
              quantity: true,
              product: { select: { name: true } },
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          },
        },
      });
    } catch (error) {
      normalizeDbError(error, { repository: 'order', operation: 'listCustomerOrderVisibility' });
    }
  },

  async findCustomerOrderDetailVisibility({ userId, orderId } = {}) {
    try {
      return await prisma.order.findFirst({
        where: { id: orderId, userId },
        select: {
          id: true,
          userId: true,
          createdAt: true,
          status: true,
          fulfillmentMode: true,
          fulfillmentSnapshot: true,
          totalAmount: true,
          items: {
            select: {
              quantity: true,
              unitPrice: true,
              product: { select: { name: true } },
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          },
        },
      });
    } catch (error) {
      normalizeDbError(error, { repository: 'order', operation: 'findCustomerOrderDetailVisibility' });
    }
  },

  async createIdempotentWithItemsAndUpdateStock({
    userId,
    items,
    idempotencyKey,
    stripePaymentIntentId = null,
    status = 'pending',
    fulfillment,
    email = null,
    address = null,
  }) {
    const normalizedItems = uniqueProductItems(items);
    const fulfillmentSnapshot = buildFulfillmentSnapshot({ fulfillment, email, address });
    assertValidTransition(null, status, { operation: 'createIdempotentWithItemsAndUpdateStock' });

    try {
      return await prisma.$transaction(async (tx) => {
        const productIds = normalizedItems.map((item) => item.productId);
        const products = await tx.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, price: true, localDeliveryEnabled: true },
        });

        if (products.length !== productIds.length) {
          const existing = new Set(products.map((product) => product.id));
          const missingProductId = productIds.find((productId) => !existing.has(productId));
          const error = new Error(`Product not found: ${missingProductId}`);
          error.statusCode = 404;
          throw error;
        }

        const productMap = new Map(products.map((product) => [product.id, product]));

        if (fulfillmentSnapshot.mode === 'delivery_local') {
          const blockingProduct = products.find((product) => product.localDeliveryEnabled !== true);
          if (blockingProduct) {
            throw badRequest(`delivery_local is not eligible for product: ${blockingProduct.id}`);
          }
        }

        const totalAmountMinor = sumMinorUnits(normalizedItems.map((item) => {
          const product = productMap.get(item.productId);
          const unitMinor = toMinorUnits(String(product.price));
          return multiplyMinorUnits(unitMinor, item.quantity);
        }));

        let order;
        try {
          order = await tx.order.create({
            data: {
              userId,
              status,
              idempotencyKey,
              stripePaymentIntentId,
              totalAmount: fromMinorUnits(totalAmountMinor),
              fulfillmentMode: fulfillmentSnapshot.mode,
              fulfillmentSnapshot,
            },
          });
        } catch (error) {
          if (error?.code === 'P2002') {
            const existingOrder = await tx.order.findFirst({ where: { userId, idempotencyKey } });
            if (existingOrder) {
              return { order: existingOrder, replayed: true };
            }
          }
          throw error;
        }

        for (const item of normalizedItems) {
          const updated = await tx.product.updateMany({
            where: {
              id: item.productId,
              stock: { gte: item.quantity },
            },
            data: {
              stock: { decrement: item.quantity },
            },
          });

          if (updated.count !== 1) {
            const error = new Error(`Insufficient stock for product: ${item.productId}`);
            error.statusCode = 400;
            throw error;
          }
        }

        await tx.orderItem.createMany({
          data: normalizedItems.map((item) => ({
            orderId: order.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: productMap.get(item.productId).price,
          })),
        });

        const completeOrder = await tx.order.findUnique({ where: { id: order.id }, include: { items: true } });

        return { order: completeOrder, replayed: false };
      });
    } catch (error) {
      normalizeDbError(error, { repository: 'order', operation: 'createIdempotentWithItemsAndUpdateStock' });
    }
  },

  async markFulfillmentReady({ orderId, target, actorType = 'admin', note = undefined }) {
    try {
      return await prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
        if (!order) {
          const error = new Error('Order not found');
          error.statusCode = 404;
          throw error;
        }

        if (order.status !== 'paid') {
          throw badRequest('Order must be paid before readiness transition');
        }

        const fulfillmentMode = typeof order.fulfillmentMode === 'string' ? order.fulfillmentMode.trim() : '';
        const expectedReadiness = expectedReadinessForMode(fulfillmentMode);
        if (!expectedReadiness) {
          throw badRequest('Order fulfillment mode is not readiness-compatible');
        }
        if (target !== expectedReadiness) {
          throw badRequest('Readiness target is incompatible with fulfillment mode');
        }

        if (!order.fulfillmentSnapshot || typeof order.fulfillmentSnapshot !== 'object') {
          throw badRequest('Order fulfillment snapshot is missing canonical truth');
        }

        const snapshotMode = typeof order.fulfillmentSnapshot.mode === 'string'
          ? order.fulfillmentSnapshot.mode.trim()
          : '';
        if (snapshotMode !== fulfillmentMode) {
          throw badRequest('Order fulfillment snapshot/mode contradiction');
        }

        const currentReadiness = typeof order.fulfillmentSnapshot.readiness?.state === 'string'
          ? order.fulfillmentSnapshot.readiness.state.trim()
          : null;
        if (currentReadiness && currentReadiness !== expectedReadiness) {
          const error = new Error('Order readiness state is incompatible with fulfillment mode');
          error.statusCode = 409;
          throw error;
        }
        if (currentReadiness === expectedReadiness) {
          const error = new Error('Order is already in readiness state');
          error.statusCode = 409;
          throw error;
        }

        const readinessNote = sanitizeReadinessNote(note);
        const nextSnapshot = {
          ...order.fulfillmentSnapshot,
          readiness: {
            state: expectedReadiness,
            readyAt: new Date().toISOString(),
            ...(readinessNote ? { note: readinessNote } : {}),
          },
        };

        const updateResult = await tx.order.updateMany({
          where: { id: order.id, status: 'paid' },
          data: { fulfillmentSnapshot: nextSnapshot },
        });
        if (updateResult.count !== 1) {
          const error = new Error('Readiness transition conflict');
          error.statusCode = 409;
          throw error;
        }

        await tx.orderEvent.create({
          data: {
            orderId: order.id,
            type: 'fulfillment_readiness',
            fromStatus: order.status,
            toStatus: order.status,
            source: actorType,
            sourceEventId: null,
            idempotencyKey: order.idempotencyKey || null,
            correlationId: null,
          },
        });

        return tx.order.findUnique({ where: { id: order.id }, include: { items: true } });
      });
    } catch (error) {
      normalizeDbError(error, { repository: 'order', operation: 'markFulfillmentReady' });
    }
  },

  async markFulfillmentCompleted({ orderId, target, actorType = 'admin', note = undefined }) {
    try {
      return await prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
        if (!order) {
          const error = new Error('Order not found');
          error.statusCode = 404;
          throw error;
        }

        if (order.status !== 'paid') {
          throw badRequest('Order must be paid before completion transition');
        }

        const fulfillmentMode = typeof order.fulfillmentMode === 'string' ? order.fulfillmentMode.trim() : '';
        const expectedReadiness = expectedReadinessForMode(fulfillmentMode);
        const expectedCompletion = expectedCompletionForMode(fulfillmentMode);
        if (!expectedReadiness || !expectedCompletion) {
          throw badRequest('Order fulfillment mode is not completion-compatible');
        }
        if (target !== expectedCompletion) {
          throw badRequest('Completion target is incompatible with fulfillment mode');
        }

        if (!order.fulfillmentSnapshot || typeof order.fulfillmentSnapshot !== 'object') {
          throw badRequest('Order fulfillment snapshot is missing canonical truth');
        }

        const snapshotMode = typeof order.fulfillmentSnapshot.mode === 'string'
          ? order.fulfillmentSnapshot.mode.trim()
          : '';
        if (snapshotMode !== fulfillmentMode) {
          throw badRequest('Order fulfillment snapshot/mode contradiction');
        }

        const readinessState = typeof order.fulfillmentSnapshot.readiness?.state === 'string'
          ? order.fulfillmentSnapshot.readiness.state.trim()
          : null;
        if (!readinessState) {
          throw badRequest('Order readiness state is required before completion transition');
        }
        if (readinessState !== expectedReadiness) {
          throw badRequest('Order readiness state is incompatible with fulfillment mode');
        }

        const currentCompletion = typeof order.fulfillmentSnapshot.completion?.state === 'string'
          ? order.fulfillmentSnapshot.completion.state.trim()
          : null;
        if (currentCompletion && currentCompletion !== expectedCompletion) {
          const error = new Error('Order completion state is incompatible with fulfillment mode');
          error.statusCode = 409;
          throw error;
        }
        if (currentCompletion === expectedCompletion) {
          const error = new Error('Order is already in completion state');
          error.statusCode = 409;
          throw error;
        }

        const completionNote = sanitizeReadinessNote(note);
        const nextSnapshot = {
          ...order.fulfillmentSnapshot,
          completion: {
            state: expectedCompletion,
            completedAt: new Date().toISOString(),
            ...(completionNote ? { note: completionNote } : {}),
          },
        };

        const updateResult = await tx.order.updateMany({
          where: { id: order.id, status: 'paid' },
          data: { fulfillmentSnapshot: nextSnapshot },
        });
        if (updateResult.count !== 1) {
          const error = new Error('Completion transition conflict');
          error.statusCode = 409;
          throw error;
        }

        await tx.orderEvent.create({
          data: {
            orderId: order.id,
            type: 'fulfillment_completion',
            fromStatus: order.status,
            toStatus: order.status,
            source: actorType,
            sourceEventId: null,
            idempotencyKey: order.idempotencyKey || null,
            correlationId: null,
          },
        });

        return tx.order.findUnique({ where: { id: order.id }, include: { items: true } });
      });
    } catch (error) {
      normalizeDbError(error, { repository: 'order', operation: 'markFulfillmentCompleted' });
    }
  },

  /**
   * Pending payment order with atomic stock reservation.
   * - idempotencyKey unique => replay-safe
   * - all stock updates occur in one transaction with rollback on first failure
   */
  async createPendingPaymentOrder({ userId, items, idempotencyKey, stripePaymentIntentId, expectedTotalAmount = undefined, expectedTotalAmountMinor = undefined }) {
    const normalizedItems = uniqueProductItems(items);
    assertValidTransition(null, 'pending', { operation: 'createPendingPaymentOrder' });

    try {
      return await prisma.$transaction(async (tx) => {
        const productIds = normalizedItems.map((item) => item.productId);
        const products = await tx.product.findMany({
          where: { id: { in: productIds }, active: true },
          select: { id: true, price: true },
        });

        if (products.length !== productIds.length) {
          const existing = new Set(products.map((product) => product.id));
          const missingProductId = productIds.find((productId) => !existing.has(productId));
          const error = new Error(`Product not found: ${missingProductId}`);
          error.statusCode = 404;
          throw error;
        }

        const productMap = new Map(products.map((product) => [product.id, product]));
        const totalAmountMinor = sumMinorUnits(normalizedItems.map((item) => {
          const unitMinor = toMinorUnits(String(productMap.get(item.productId).price));
          return multiplyMinorUnits(unitMinor, item.quantity);
        }));

        assertExpectedAmountMatches({ expectedTotalAmount, expectedTotalAmountMinor, totalAmountMinor });

        let order;
        try {
          order = await tx.order.create({
            data: {
              userId,
              status: 'pending',
              idempotencyKey,
              stripePaymentIntentId,
              totalAmount: fromMinorUnits(totalAmountMinor),
            },
          });
        } catch (error) {
          if (error?.code === 'P2002') {
            const existingOrder = await tx.order.findFirst({ where: { userId, idempotencyKey }, include: { items: true } });
            if (existingOrder) {
              return { order: existingOrder, replayed: true };
            }
          }
          throw error;
        }

        // Reserve stock atomically for all order items.
        for (const item of normalizedItems) {
          const updated = await tx.product.updateMany({
            where: {
              id: item.productId,
              stock: { gte: item.quantity },
            },
            data: {
              stock: { decrement: item.quantity },
            },
          });

          if (updated.count !== 1) {
            const error = new Error(`Insufficient stock for product: ${item.productId}`);
            error.statusCode = 400;
            throw error;
          }
        }

        await tx.orderItem.createMany({
          data: normalizedItems.map((item) => ({
            orderId: order.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: productMap.get(item.productId).price,
          })),
        });

        const completeOrder = await tx.order.findUnique({ where: { id: order.id }, include: { items: true } });
        return { order: completeOrder, replayed: false };
      });
    } catch (error) {
      normalizeDbError(error, { repository: 'order', operation: 'createPendingPaymentOrder' });
    }
  },

  async markPaidFromWebhook({ eventId, paymentIntentId, orderId, userId, expectedIdempotencyKey, provider = 'stripe', payload = {}, correlationId = null }) {
    try {
      return await prisma.$transaction(async (tx) => {
        const resourceId = extractWebhookResourceId({ provider, paymentIntentId, payload });

        try {
          await tx.paymentWebhookEvent.create({
            data: {
              provider,
              eventId,
              resourceId,
              orderId,
              payload,
            },
          });
        } catch (error) {
          if (isUniqueConstraintOnTarget(error, 'event_id') || isUniqueConstraintOnTarget(error, 'resource_id') || error?.code === 'P2002') {
            return { replayed: true, orderMarkedPaid: false };
          }
          throw error;
        }

        const order = await tx.order.findUnique({ where: { id: orderId } });
        if (!order) {
          const error = new Error(`Order not found: ${orderId}`);
          error.statusCode = 404;
          throw error;
        }

        if (order.userId !== userId || order.idempotencyKey !== expectedIdempotencyKey) {
          const error = new Error('Webhook metadata mismatch for order identity/idempotency');
          error.statusCode = 400;
          throw error;
        }

        if (order.status === 'paid') {
          return { replayed: true, orderMarkedPaid: false };
        }

        return updateOrderPaidAndRecordEvent({
          tx,
          order,
          where: { id: orderId, status: { not: 'paid' } },
          stripePaymentIntentId: paymentIntentId || order.stripePaymentIntentId,
          provider,
          sourceEventId: eventId,
          correlationId,
        });
      });
    } catch (error) {
      normalizeDbError(error, { repository: 'order', operation: 'markPaidFromWebhook' });
    }
  },

  async processPaymentWebhookEvent({ provider, eventId, orderId = null, stripePaymentIntentId = null, payload = {}, correlationId = null }) {
    try {
      return await prisma.$transaction(async (tx) => {
        const resourceId = extractWebhookResourceId({ provider, paymentIntentId: stripePaymentIntentId, payload });

        try {
          await tx.paymentWebhookEvent.create({
            data: {
              provider,
              eventId,
              resourceId,
              orderId,
              payload,
            },
          });
        } catch (error) {
          if (isUniqueConstraintOnTarget(error, 'event_id') || isUniqueConstraintOnTarget(error, 'resource_id') || error?.code === 'P2002') {
            return { replayed: true, orderMarkedPaid: false };
          }
          throw error;
        }

        if (payload?.metadata?.idempotencyKey) {
          const existingOrder = await tx.order.findUnique({ where: { id: orderId } });
          if (!existingOrder || existingOrder.idempotencyKey !== payload.metadata.idempotencyKey) {
            const error = new Error('Webhook idempotency key mismatch');
            error.statusCode = 400;
            throw error;
          }

          if (existingOrder.status === 'paid') {
            return { replayed: true, orderMarkedPaid: false };
          }
        }

        let order = null;
        if (orderId) {
          order = await tx.order.findUnique({ where: { id: orderId } });
        } else if (stripePaymentIntentId) {
          order = await tx.order.findFirst({ where: { stripePaymentIntentId } });
        }

        if (!order) {
          return { replayed: false, orderMarkedPaid: false };
        }

        if (order.status === 'paid') {
          return payload?.metadata?.idempotencyKey
            ? { replayed: true, orderMarkedPaid: false }
            : { replayed: false, orderMarkedPaid: false };
        }

        const where = orderId
          ? { id: orderId, status: { not: 'paid' } }
          : { stripePaymentIntentId, status: { not: 'paid' } };

        return updateOrderPaidAndRecordEvent({
          tx,
          order,
          where,
          stripePaymentIntentId,
          provider,
          sourceEventId: eventId,
          correlationId,
        });
      });
    } catch (error) {
      normalizeDbError(error, { repository: 'order', operation: 'processPaymentWebhookEvent' });
    }
  },

  async recordUnderReviewCommunicationUnitFromWebhook({
    orderId,
    currentStatus,
    intendedFinalizationKey,
    stripePaymentIntentId,
    correlationId = null,
  }) {
    const normalizedOrderId = typeof orderId === 'string' ? orderId.trim() : '';
    const normalizedStatus = typeof currentStatus === 'string' ? currentStatus.trim().toLowerCase() : '';
    const normalizedIntent = typeof intendedFinalizationKey === 'string' ? intendedFinalizationKey.trim() : '';
    const normalizedIntentId = typeof stripePaymentIntentId === 'string' ? stripePaymentIntentId.trim() : '';

    if (!normalizedOrderId || !normalizedStatus || !normalizedIntent || !normalizedIntentId) {
      return {
        recorded: false,
        deduped: false,
        reason: 'insufficient_context',
        communicationUnitId: null,
      };
    }

    const seam = 'stripe_success_emission_blocked';
    const semanticClass = 'under_review';
    const communicationUnitId = buildUnderReviewCommunicationUnitId({
      seam,
      semanticClass,
      orderId: normalizedOrderId,
      intendedFinalizationKey: normalizedIntent,
      resourceId: normalizedIntentId,
    });

    try {
      await prisma.$transaction(async (tx) => {
        await tx.orderEvent.create({
          data: {
            orderId: normalizedOrderId,
            type: 'customer_under_review_communication',
            fromStatus: normalizedStatus,
            toStatus: normalizedStatus,
            source: 'stripe',
            sourceEventId: communicationUnitId,
            idempotencyKey: normalizedIntent,
            correlationId,
          },
        });
      });
    } catch (error) {
      if (isUniqueConstraintOnTarget(error, 'source_event_id') || error?.code === 'P2002') {
        return {
          recorded: false,
          deduped: true,
          reason: 'duplicate_communication_unit',
          communicationUnitId,
        };
      }
      normalizeDbError(error, {
        repository: 'order',
        operation: 'recordUnderReviewCommunicationUnitFromWebhook',
      });
    }

    return {
      recorded: true,
      deduped: false,
      reason: 'recorded',
      communicationUnitId,
    };
  },
};

export default orderRepository;
