import {
  loadCart,
  updateBadge,
  setQty as setRemoteQty,
  removeItem as removeRemoteItem,
  clearCart as clearRemoteCart
} from './cart.js';
import { showToast } from './toast.js';
import { fromMinorUnitsNumber, multiplyMinorUnits, sumMinorUnits, toMinorUnitsDecimalString } from './money.js';

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


function toMoneyMinor(value) {
  return toMinorUnitsDecimalString(String(value), 'EUR');
}

function toDisplayAmount(minor) {
  return fromMinorUnitsNumber(minor, 'EUR');
}


async function openCart() {
  cartDrawer.classList.add('open');
  cartBackdrop.hidden = false;
  cartDrawer.setAttribute('aria-hidden', 'false');
  await renderCart();
}
function closeCart() {
  cartDrawer.classList.remove('open');
  cartBackdrop.hidden = true;
  cartDrawer.setAttribute('aria-hidden', 'true');
}

async function setQty(id, qty) {
  await setRemoteQty(id, qty);
}
async function removeItem(id) {
  await removeRemoteItem(id);
}
async function clearCart() {
  await clearRemoteCart();
}

function lineHTML(id, it) {
  const lineTotalMinor = multiplyMinorUnits(toMoneyMinor(it.price), it.qty);
  return `
    <div class="cart-drawer__item" role="listitem">
      <img src="${IMG_BY_ID[id] || 'assets/images/placeholder.png'}" alt="${it.name}">
      <div class="cart-drawer__meta">
        <div class="cart-drawer__name">${it.name}</div>
        <div class="cart-drawer__price">${currency.format(toDisplayAmount(toMoneyMinor(it.price)))}</div>
        <div class="cart-drawer__qty">
          <button class="qty-btn" data-act="dec" data-id="${id}" aria-label="Diminuer" type="button">−</button>
          <span aria-live="polite">${it.qty}</span>
          <button class="qty-btn" data-act="inc" data-id="${id}" aria-label="Augmenter" type="button">+</button>
          <button class="remove-btn" data-act="rm" data-id="${id}" aria-label="Supprimer" type="button">Supprimer</button>
        </div>
      </div>
      <div class="cart-drawer__line-total">${currency.format(toDisplayAmount(lineTotalMinor))}</div>
    </div>
  `;
}

async function renderCart() {
  const cart = await loadCart();
  const entries = Object.entries(cart.items);
  cartList.innerHTML = '';
  const lineMinors = [];
  for (const [id, it] of entries) {
    cartList.insertAdjacentHTML('beforeend', lineHTML(id, it));
    lineMinors.push(multiplyMinorUnits(toMoneyMinor(it.price), it.qty));
  }
  const totalMinor = sumMinorUnits(lineMinors);
  cartTotalEl.textContent = currency.format(toDisplayAmount(totalMinor));
  cartBackdrop.hidden = !cartDrawer.classList.contains('open');
}

async function renderCartPage() {
  const cart = await loadCart();
  const entries = Object.entries(cart.items);
  if (entries.length === 0) {
    cartPageContainer.innerHTML = `<p>Votre panier est vide.</p>`;
    return;
  }
  const lineMinors = [];
  const list = entries.map(([id, it]) => {
    lineMinors.push(multiplyMinorUnits(toMoneyMinor(it.price), it.qty));
    return lineHTML(id, it);
  }).join('');
  const totalMinor = sumMinorUnits(lineMinors);

  cartPageContainer.innerHTML = `
    ${list}
    <div class="cart-drawer__footer" style="position:sticky;bottom:0;">
      <div class="cart-drawer__total">
        <span>Total</span>
        <strong>${currency.format(toDisplayAmount(totalMinor))}</strong>
      </div>
      <div class="cart-drawer__actions">
        <button class="btn btn-outline" id="checkoutBtnPage" type="button">Finaliser la commande</button>
        <button class="btn btn-link danger" id="clearCartBtnPage" type="button">Vider</button>
      </div>
    </div>
  `;

  // Délégation événements sur la page panier
  cartPageContainer.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.id;
    const act = btn.dataset.act;
    if (act === 'inc') {
      const current = await loadCart();
      await setQty(id, current.items[id].qty + 1);
    }
    if (act === 'dec') {
      const current = await loadCart();
      await setQty(id, current.items[id].qty - 1);
    }
    if (act === 'rm') {
      await removeItem(id);
    }
    await renderCartPage();
  }, { once: true });

  document.getElementById('checkoutBtnPage').addEventListener('click', () => {
    goToCheckout();
  }, { once: true });
  document.getElementById('clearCartBtnPage').addEventListener('click', async () => {
    await clearCart();
    await renderCartPage();
    await updateBadge();
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
  cartBtn.addEventListener('click', () => {
    openCart();
  });
  cartCloseBtn.addEventListener('click', closeCart);
  cartBackdrop.addEventListener('click', closeCart);

  // Liste drawer (délégation)
  cartList.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.id;
    const act = btn.dataset.act;
    if (act === 'inc') {
      const current = await loadCart();
      await setQty(id, current.items[id].qty + 1);
    }
    if (act === 'dec') {
      const current = await loadCart();
      await setQty(id, current.items[id].qty - 1);
    }
    if (act === 'rm') {
      await removeItem(id);
    }
    await renderCart();
  });

  // Footer drawer
  clearCartBtn.addEventListener('click', async () => {
    await clearCart();
    await renderCart();
  });
  goToCartBtn.addEventListener('click', () => {
    document.getElementById('panier').style.display = 'block';
    closeCart();
    renderCartPage();
    document.getElementById('panier').scrollIntoView({ behavior: 'smooth' });
  });
  checkoutBtn.addEventListener('click', () => {
    closeCart();
    goToCheckout();
  });

  // Premier rendu au chargement
  renderCart();
}

function goToCheckout() {
  if (window.location.pathname.endsWith('checkout.html')) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  window.location.href = 'checkout.html';
}

export function wireAddToCartButtons() {
  document.querySelectorAll(".add-to-cart").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id, name = btn.dataset.product, price = btn.dataset.price;
      // réutilise la fonction métier importée (depuis main.js)
      import('./cart.js').then(async ({ addToCart }) => {
        await addToCart(id, name, price);
        showToast(`✅ ${name} ajouté au panier`, 'success');
      });
    });
  });
}