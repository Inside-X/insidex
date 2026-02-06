import { loadCart, saveCart, updateBadge } from './cart.js';
import { showToast } from './toast.js';

const currency = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const IMG_BY_ID = {
  sora: 'assets/images/sora.jpg',
  kahawa: 'assets/images/kahawa.jpg',
  amani: 'assets/images/amani.jpg',
  kila: 'assets/images/kila.jpg',
  neko: 'assets/images/neko.jpg',
  kumi: 'assets/images/kumi.jpg'
};

let cartBtn, cartDrawer, cartBackdrop, cartCloseBtn, cartList, cartTotalEl, goToCartBtn, clearCartBtn, checkoutBtn;
let cartPageContainer;

function openCart() {
  cartDrawer.classList.add('open');
  cartBackdrop.hidden = false;
  cartDrawer.setAttribute('aria-hidden', 'false');
  renderCart();
}
function closeCart() {
  cartDrawer.classList.remove('open');
  cartBackdrop.hidden = true;
  cartDrawer.setAttribute('aria-hidden', 'true');
}

function setQty(id, qty) {
  const cart = loadCart();
  if (!cart.items[id]) return;
  cart.items[id].qty = Math.max(1, qty);
  saveCart(cart);
  updateBadge();
}
function removeItem(id) {
  const cart = loadCart();
  delete cart.items[id];
  saveCart(cart);
  updateBadge();
}
function clearCart() {
  saveCart({ items: {} });
  updateBadge();
}

function lineHTML(id, it) {
  const lineTotal = it.price * it.qty;
  return `
    <div class="cart-drawer__item" role="listitem">
      <img src="${IMG_BY_ID[id] || 'assets/images/placeholder.png'}" alt="${it.name}">
      <div class="cart-drawer__meta">
        <div class="cart-drawer__name">${it.name}</div>
        <div class="cart-drawer__price">${currency.format(it.price)}</div>
        <div class="cart-drawer__qty">
          <button class="qty-btn" data-act="dec" data-id="${id}" aria-label="Diminuer" type="button">−</button>
          <span aria-live="polite">${it.qty}</span>
          <button class="qty-btn" data-act="inc" data-id="${id}" aria-label="Augmenter" type="button">+</button>
          <button class="remove-btn" data-act="rm" data-id="${id}" aria-label="Supprimer" type="button">Supprimer</button>
        </div>
      </div>
      <div class="cart-drawer__line-total">${currency.format(lineTotal)}</div>
    </div>
  `;
}

function renderCart() {
  const cart = loadCart();
  const entries = Object.entries(cart.items);
  cartList.innerHTML = '';
  let total = 0;
  for (const [id, it] of entries) {
    cartList.insertAdjacentHTML('beforeend', lineHTML(id, it));
    total += it.price * it.qty;
  }
  cartTotalEl.textContent = currency.format(total);
  cartBackdrop.hidden = !cartDrawer.classList.contains('open');
}

function renderCartPage() {
  const cart = loadCart();
  const entries = Object.entries(cart.items);
  if (entries.length === 0) {
    cartPageContainer.innerHTML = `<p>Votre panier est vide.</p>`;
    return;
  }
  let total = 0;
  const list = entries.map(([id, it]) => {
    total += it.price * it.qty;
    return lineHTML(id, it);
  }).join('');

  cartPageContainer.innerHTML = `
    ${list}
    <div class="cart-drawer__footer" style="position:sticky;bottom:0;">
      <div class="cart-drawer__total">
        <span>Total</span>
        <strong>${currency.format(total)}</strong>
      </div>
      <div class="cart-drawer__actions">
        <button class="btn btn-outline" id="checkoutBtnPage" type="button">Passer la commande</button>
        <button class="btn btn-link danger" id="clearCartBtnPage" type="button">Vider</button>
      </div>
    </div>
  `;

  // Délégation événements sur la page panier
  cartPageContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.id;
    const act = btn.dataset.act;
    if (act === 'inc') setQty(id, loadCart().items[id].qty + 1);
    if (act === 'dec') setQty(id, loadCart().items[id].qty - 1);
    if (act === 'rm') removeItem(id);
    renderCartPage();
  }, { once: true });

  document.getElementById('checkoutBtnPage').addEventListener('click', () => {
    showToast('🧾 Le passage de commande arrive bientôt !', 'info');
  }, { once: true });
  document.getElementById('clearCartBtnPage').addEventListener('click', () => {
    clearCart(); renderCartPage(); updateBadge();
  }, { once: true });
}

export function initCartDrawer() {
  // Sélecteurs
  cartBtn = document.getElementById('cartBtn');
  cartDrawer = document.getElementById('cartDrawer');
  cartBackdrop = document.getElementById('cartBackdrop');
  cartCloseBtn = document.getElementById('cartCloseBtn');
  cartList = document.getElementById('cartDrawerList');
  cartTotalEl = document.getElementById('cartDrawerTotal');
  goToCartBtn = document.getElementById('goToCartBtn');
  clearCartBtn = document.getElementById('clearCartBtn');
  checkoutBtn = document.getElementById('checkoutBtn');
  cartPageContainer = document.getElementById('cartPageContainer');

  // Ouvrir / fermer
  cartBtn.addEventListener('click', openCart);
  cartCloseBtn.addEventListener('click', closeCart);
  cartBackdrop.addEventListener('click', closeCart);

  // Liste drawer (délégation)
  cartList.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.id;
    const act = btn.dataset.act;
    if (act === 'inc') setQty(id, loadCart().items[id].qty + 1);
    if (act === 'dec') setQty(id, loadCart().items[id].qty - 1);
    if (act === 'rm') removeItem(id);
    renderCart();
  });

  // Footer drawer
  clearCartBtn.addEventListener('click', () => { clearCart(); renderCart(); });
  goToCartBtn.addEventListener('click', () => {
    document.getElementById('panier').style.display = 'block';
    closeCart();
    renderCartPage();
    document.getElementById('panier').scrollIntoView({ behavior: 'smooth' });
  });
  checkoutBtn.addEventListener('click', () => {
    showToast('🧾 Le passage de commande arrive bientôt !', 'info');
  });

  // Premier rendu au chargement
  renderCart();
}

export function wireAddToCartButtons() {
  document.querySelectorAll(".add-to-cart").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id, name = btn.dataset.product, price = btn.dataset.price;
      // réutilise la fonction métier importée (depuis main.js)
      import('./cart.js').then(({ addToCart }) => {
        addToCart(id, name, price);
        showToast(`✅ ${name} ajouté au panier`, 'success');
      });
    });
  });
}