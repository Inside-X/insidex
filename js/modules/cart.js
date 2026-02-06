// Année footer
document.getElementById("year").textContent = new Date().getFullYear().toString();

// --- Panier (localStorage) ---
const CART_KEY = "insidex_cart";

export function loadCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || { items: {} }; }
  catch { return { items: {} }; }
}
export function saveCart(cart) { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }
export function getCartCount(cart) { return Object.values(cart.items).reduce((s, it) => s + it.qty, 0); }

const countEl = document.getElementById("cartCount");
export function updateBadge() { countEl.textContent = getCartCount(loadCart()).toString(); }

export function addToCart(id, name, price) {
  const cart = loadCart();
  if (!cart.items[id]) cart.items[id] = { name, price: Number(price), qty: 0 };
  cart.items[id].qty += 1;
  saveCart(cart);
  updateBadge();
}