import { initHeader } from './modules/header.js';
import { initAuth } from './modules/auth.js';
import { initCartDrawer } from './modules/cartDrawer.js';
import { updateBadge } from './modules/cart.js';
import { renderTexts } from './modules/renderTexts.js';
import { initAnalytics } from './modules/analytics.js';
import { showToast } from './modules/toast.js';
import {
  addAddress,
  getAccount,
  getActiveEmail,
  renameAccount,
  setActiveEmail,
  upsertProfile
} from './modules/accountData.js';
import { fromMinorUnitsNumber, toMinorUnitsDecimalString } from './modules/money.js';

const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short'
});
const currency = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

const selectors = {
  status: document.getElementById('accountStatus'),
  activeEmail: document.getElementById('accountActiveEmail'),
  lookupForm: document.getElementById('accountLookupForm'),
  lookupEmail: document.getElementById('accountLookupEmail'),
  profileForm: document.getElementById('profileForm'),
  profileName: document.getElementById('profileName'),
  profileEmail: document.getElementById('profileEmail'),
  profilePhone: document.getElementById('profilePhone'),
  addressForm: document.getElementById('addressForm'),
  addressList: document.getElementById('addressesList'),
  ordersList: document.getElementById('ordersList')
};

let activeEmail = '';
const ACCESS_TOKEN_KEY = 'insidex_access_token';

function formatEuroAmount(amount) {
  const normalizedMinor = toMinorUnitsDecimalString(String(amount ?? '0'), 'EUR');
  return currency.format(fromMinorUnitsNumber(normalizedMinor, 'EUR'));
}


function setStatus(message, tone = 'info') {
  if (!selectors.status) return;
  selectors.status.textContent = message;
  selectors.status.dataset.tone = tone;
}

function renderProfile(account) {
  const profile = account.profile || {};
  if (selectors.profileName) selectors.profileName.value = profile.name || '';
  if (selectors.profileEmail) selectors.profileEmail.value = profile.email || activeEmail || '';
  if (selectors.profilePhone) selectors.profilePhone.value = profile.phone || '';
}

function renderAddresses(account) {
  if (!selectors.addressList) return;
  const addresses = account.addresses || [];
  if (addresses.length === 0) {
    selectors.addressList.innerHTML = '<p class="account-empty">Aucune adresse enregistrée pour le moment.</p>';
    return;
  }
  selectors.addressList.innerHTML = addresses.map((address) => `
    <article class="account-address">
      <div>
        <h3>${address.label || 'Adresse de livraison'}</h3>
        <p>${address.fullName}</p>
        <p>${address.line}</p>
        <p>${address.postalCode} ${address.city}</p>
        <p>${address.country}</p>
        <p class="account-muted">${address.phone || ''}</p>
      </div>
      <span class="account-badge">${address.lastUsed || 'Adresse enregistrée'}</span>
    </article>
  `).join('');
}

function badgeClassForStatus(statusCode) {
  if (statusCode === 'completed' || statusCode === 'confirmed') return 'account-badge--success';
  if (statusCode === 'ready') return 'account-badge--info';
  if (statusCode === 'cancelled') return 'account-badge--neutral';
  return 'account-badge--warning';
}

function renderOrdersList(orders, { degraded = false } = {}) {
  if (!selectors.ordersList) return;
  if (orders.length === 0) {
    selectors.ordersList.innerHTML = '<p class="account-empty">Vous n’avez pas encore de commande. Une fois votre premier achat finalisé, il apparaîtra ici.</p>';
    return;
  }

  const degradedBanner = degraded
    ? '<p class="account-info account-info--warning">Certaines informations de commande sont momentanément limitées.</p>'
    : '';

  selectors.ordersList.innerHTML = orders.map((order) => {
    const statusLabel = order?.status?.label || 'Update in progress';
    const statusCode = order?.status?.code || 'pending_confirmation';
    const fulfillmentLabel = order?.fulfillmentMode?.label || 'Fulfillment update';
    const itemSummary = order?.itemSummary?.text || 'Item details unavailable';
    const totalAmount = order?.totalAmount == null ? null : formatEuroAmount(order.totalAmount);
    const orderDate = order?.orderDate ? dateFormatter.format(new Date(order.orderDate)) : 'Date unavailable';

    return `
      <article class="account-order">
        <header class="account-order__header">
          <div>
            <h3>Order ${order.orderId || '—'}</h3>
            <p class="account-muted">${orderDate}</p>
          </div>
          <span class="account-badge ${badgeClassForStatus(statusCode)}">${statusLabel}</span>
        </header>
        <div class="account-order__body">
          <div>
            <p class="account-order__label">Items</p>
            <p>${itemSummary}</p>
          </div>
          <div>
            <p class="account-order__label">Fulfillment</p>
            <p>${fulfillmentLabel}</p>
          </div>
          <div>
            <p class="account-order__label">Total</p>
            <p>${totalAmount || 'Amount unavailable'}</p>
          </div>
        </div>
      </article>
    `;
  }).join('') + degradedBanner;
}

function renderOrdersLoading() {
  if (!selectors.ordersList) return;
  selectors.ordersList.innerHTML = '<p class="account-info">Loading your orders…</p>';
}

function renderOrdersError() {
  if (!selectors.ordersList) return;
  selectors.ordersList.innerHTML = '<p class="account-info account-info--error">Unable to load your order history right now. Please try again shortly.</p>';
}

function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

async function fetchCustomerOrders(limit = 20) {
  const accessToken = getAccessToken();
  if (!accessToken) {
    return { kind: 'unauthenticated' };
  }

  const response = await fetch(`/api/orders/mine?limit=${limit}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { kind: 'error', status: response.status, payload };
  }

  return { kind: 'ok', data: Array.isArray(payload?.data) ? payload.data : [], meta: payload?.meta || {} };
}

async function renderOrdersSurface() {
  renderOrdersLoading();
  const result = await fetchCustomerOrders(20);

  if (result.kind === 'unauthenticated' || result.status === 401) {
    if (selectors.ordersList) {
      selectors.ordersList.innerHTML = '<p class="account-info">Sign in to view your order history.</p>';
    }
    return;
  }

  if (result.kind === 'error') {
    renderOrdersError();
    return;
  }

  renderOrdersList(result.data, { degraded: result.meta?.degraded === true });
}

function renderAccount(email) {
  if (selectors.activeEmail) {
    selectors.activeEmail.textContent = email ? `Commandes associées à ${email}` : 'Aucun compte sélectionné';
  }
  if (!email) {
    setStatus('Connectez-vous pour accéder à vos commandes.', 'info');
    renderProfile({ profile: null, addresses: [], orders: [] });
    renderAddresses({ addresses: [] });
    if (selectors.ordersList) {
      selectors.ordersList.innerHTML = '<p class="account-info">Sign in to view your order history.</p>';
    }
    return;
  }
  const account = getAccount(email);
  renderProfile(account);
  renderAddresses(account);
  void renderOrdersSurface();
  setStatus('Profil synchronisé avec vos données locales.', 'success');
}

function handleLookup(event) {
  event.preventDefault();
  const email = selectors.lookupEmail.value.trim();
  if (!email) {
    setStatus('Merci de saisir un email pour retrouver vos commandes.', 'error');
    return;
  }
  activeEmail = email.toLowerCase();
  setActiveEmail(activeEmail);
  renderAccount(activeEmail);
}

function handleProfileSubmit(event) {
  event.preventDefault();
  const formData = new FormData(selectors.profileForm);
  const name = formData.get('name')?.toString().trim();
  const email = formData.get('email')?.toString().trim();
  const phone = formData.get('phone')?.toString().trim();
  if (!email) {
    setStatus('Un email est requis pour enregistrer votre profil.', 'error');
    return;
  }
  if (activeEmail && activeEmail !== email.toLowerCase()) {
    renameAccount(activeEmail, email);
  }
  upsertProfile(email, { name, email, phone });
  activeEmail = email.toLowerCase();
  setActiveEmail(activeEmail);
  renderAccount(activeEmail);
  showToast('✅ Profil mis à jour.', 'success');
}

function handleAddressSubmit(event) {
  event.preventDefault();
  if (!activeEmail) {
    setStatus('Ajoutez votre email avant d’enregistrer une adresse.', 'error');
    return;
  }
  const formData = new FormData(selectors.addressForm);
  const address = {
    label: formData.get('label')?.toString().trim() || 'Adresse principale',
    fullName: formData.get('fullName')?.toString().trim(),
    line: formData.get('line')?.toString().trim(),
    postalCode: formData.get('postalCode')?.toString().trim(),
    city: formData.get('city')?.toString().trim(),
    country: formData.get('country')?.toString().trim(),
    phone: formData.get('phone')?.toString().trim(),
    lastUsed: 'Ajoutée à l’instant'
  };
  addAddress(activeEmail, address);
  selectors.addressForm.reset();
  renderAccount(activeEmail);
  showToast('✅ Adresse ajoutée.', 'success');
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    initAnalytics();
  } catch (error) {
    console.error('analytics bootstrap failed:', error);
  }

  try {
    initHeader();
  } catch (error) {
    console.error('header bootstrap failed:', error);
  }

  try {
    await initAuth();
  } catch (error) {
    console.error('auth bootstrap failed:', error);
  }

  try {
    initCartDrawer();
  } catch (error) {
    console.error('cart drawer bootstrap failed:', error);
  }

  try {
    await renderTexts();
  } catch (error) {
    console.error('content rendering failed:', error);
  }

  try {
    await updateBadge();
  } catch (error) {
    console.error('cart badge refresh failed:', error);
  }

  activeEmail = getActiveEmail();
  if (selectors.lookupEmail && activeEmail) {
    selectors.lookupEmail.value = activeEmail;
  }
  renderAccount(activeEmail);

  if (selectors.lookupForm) {
    selectors.lookupForm.addEventListener('submit', handleLookup);
  }
  if (selectors.profileForm) {
    selectors.profileForm.addEventListener('submit', handleProfileSubmit);
  }
  if (selectors.addressForm) {
    selectors.addressForm.addEventListener('submit', handleAddressSubmit);
  }
});
