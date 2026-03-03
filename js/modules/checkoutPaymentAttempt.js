import { createPaymentIntent } from './paymentsClient.js';

let activeCheckoutAttemptIdempotencyKey = null;
let createIntentInFlight = false;

function defaultIdempotencyKeyFactory() {
  const randomPart = Math.random().toString(36).slice(2);
  return `checkout_${Date.now()}_${randomPart}`;
}

export function getOrCreateCheckoutAttemptIdempotencyKey({ keyFactory = defaultIdempotencyKeyFactory } = {}) {
  if (!activeCheckoutAttemptIdempotencyKey) {
    activeCheckoutAttemptIdempotencyKey = keyFactory();
  }
  return activeCheckoutAttemptIdempotencyKey;
}

export function resetCheckoutAttemptIdempotencyKey() {
  activeCheckoutAttemptIdempotencyKey = null;
}

export function isCreateIntentInFlight() {
  return createIntentInFlight;
}

function toCheckoutIntentItems(items) {
  if (!Array.isArray(items)) return [];

  return items.map((item) => ({
    id: item?.id,
    quantity: item?.quantity ?? item?.qty,
  }));
}

export async function createCheckoutPaymentIntent({
  checkoutItems,
  requestPaymentIntent = createPaymentIntent,
  onPendingChange = () => {},
  keyFactory,
} = {}) {
  if (createIntentInFlight) {
    return { skipped: true };
  }

  createIntentInFlight = true;
  onPendingChange(true);

  try {
    const idempotencyKey = getOrCreateCheckoutAttemptIdempotencyKey({ keyFactory });
    const response = await requestPaymentIntent({
      items: toCheckoutIntentItems(checkoutItems),
      idempotencyKey,
    });

    return { skipped: false, response };
  } finally {
    createIntentInFlight = false;
    onPendingChange(false);
  }
}

export default {
  createCheckoutPaymentIntent,
  getOrCreateCheckoutAttemptIdempotencyKey,
  resetCheckoutAttemptIdempotencyKey,
  isCreateIntentInFlight,
};