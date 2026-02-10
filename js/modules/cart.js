import { trackAnalyticsEvent } from './analytics.js';

// Année footer
const yearEl = document.getElementById("year");
if (yearEl) {
  yearEl.textContent = new Date().getFullYear().toString();
}

// --- Panier (backend) ---
const CART_ANON_KEY = "insidex_cart_anon_id";
const CART_USER_KEY = "insidex_user_id";

function getAnonId() {
  let anonId = localStorage.getItem(CART_ANON_KEY);
  if (!anonId) {
    anonId = crypto.randomUUID();
    localStorage.setItem(CART_ANON_KEY, anonId);
  }
  return anonId;
}

export function getUserId() {
  return localStorage.getItem(CART_USER_KEY);
}

export function setUserId(userId) {
  localStorage.setItem(CART_USER_KEY, userId);
}

export function clearUserId() {
  localStorage.removeItem(CART_USER_KEY);
}

function getCartContext() {
  return {
    anonId: getAnonId(),
    userId: getUserId()
  };
}

async function fetchJSON(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Erreur API (${response.status})`);
  }
  return response.json();
}

export async function loadCart() {
  const { anonId, userId } = getCartContext();
  const params = new URLSearchParams();
  if (userId) params.set('userId', userId);
  if (anonId) params.set('anonId', anonId);
  try {
    return await fetchJSON(`/api/cart?${params.toString()}`);
  } catch (error) {
    console.error('Erreur chargement panier:', error);
    return { items: {} };
  }
}

export function getCartCount(cart) { return Object.values(cart.items).reduce((s, it) => s + it.qty, 0); }

const countEl = document.getElementById("cartCount");
export async function updateBadge() {
  const cart = await loadCart();
  countEl.textContent = getCartCount(cart).toString();
}

export async function addToCart(id, name, price, qty = 1) {
  const { anonId, userId } = getCartContext();
  await fetchJSON('/api/cart/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id,
      name,
      price: Number(price),
      qty: Number(qty),
      anonId,
      userId
    })
  });
  await updateBadge();

  await trackAnalyticsEvent('add_to_cart', {
    currency: 'EUR',
    value: Number(price) * Number(qty),
    items: [{
      item_id: id,
      item_name: name,
      price: Number(price),
      quantity: Number(qty)
    }]
  });
}

export async function setQty(id, qty) {
  const { anonId, userId } = getCartContext();
  await fetchJSON(`/api/cart/items/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      qty: Number(qty),
      anonId,
      userId
    })
  });
  await updateBadge();
}

export async function removeItem(id) {
  const { anonId, userId } = getCartContext();
  await fetchJSON(`/api/cart/items/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ anonId, userId })
  });
  await updateBadge();
}

export async function clearCart() {
  const { anonId, userId } = getCartContext();
  await fetchJSON('/api/cart', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ anonId, userId })
  });
  await updateBadge();
}

export async function syncCartToUser(userId) {
  const { anonId } = getCartContext();
  if (!userId) {
    return { items: {} };
  }
  const cart = await fetchJSON('/api/cart/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ anonId, userId })
  });
  await updateBadge();
  return cart;
}