const USER_KEY = 'insidex_auth_user';

let inMemoryGuestAccessToken = null;

export function generateIdempotencyKey() {
  const randomPart = Math.random().toString(36).slice(2);
  return `checkout_${Date.now()}_${randomPart}`;
}

export function buildCheckoutPayload({ email, address, items, idempotencyKey }) {
  return {
    email,
    address,
    items,
    idempotencyKey,
  };
}

export function getGuestAccessToken() {
  return inMemoryGuestAccessToken;
}

export function normalizeMinorAmount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    throw new Error('Montant de paiement invalide (minor units attendues).');
  }
  return parsed;
}

export function storeGuestSession(meta, email) {
  if (!meta?.guestSessionToken) {
    return;
  }

  inMemoryGuestAccessToken = meta.guestSessionToken;
  localStorage.setItem(USER_KEY, JSON.stringify({
    id: null,
    email,
    name: email,
    role: 'customer',
    isGuest: true,
  }));

  document.dispatchEvent(new CustomEvent('auth:state-changed', {
    detail: {
      user: { email, role: 'customer', isGuest: true },
      role: 'customer',
      isAuthenticated: true,
      loading: false,
      error: null,
    },
  }));
}

export async function createPaymentIntent(payload, accessToken = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch('/api/payments/create-intent', {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error?.message || 'Impossible de créer le paiement.');
  }

  const amountMinor = normalizeMinorAmount(body?.data?.amount);
  return {
    ...body,
    data: {
      ...body.data,
      amount: amountMinor,
      amountDecimal: amountMinor / 100,
    },
  };
}

export async function confirmStripePayment({ clientSecret, testOutcome }) {
  if (testOutcome === 'failure') {
    return { ok: false, message: 'Paiement refusé (mode test).' };
  }

  if (typeof window.Stripe !== 'function') {
    return { ok: true, message: 'Paiement Stripe simulé (SDK non chargé).' };
  }

  const publishableKey = window.INSIDEX_STRIPE_PUBLIC_KEY;
  if (!publishableKey) {
    return { ok: false, message: 'Clé publique Stripe manquante.' };
  }

  const stripe = window.Stripe(publishableKey);
  const result = await stripe.confirmCardPayment(clientSecret);

  if (result.error) {
    return { ok: false, message: result.error.message || 'Erreur de confirmation Stripe.' };
  }

  return { ok: true, message: 'Paiement Stripe confirmé.' };
}