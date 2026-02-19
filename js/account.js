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
import { fromMinorUnitsNumber, multiplyMinorUnits, toMinorUnitsDecimalString } from './modules/money.js';

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


function toMoneyMinor(value) {
  return toMinorUnitsDecimalString(String(value ?? 0), 'EUR');
}

function minorToDisplay(minor) {
  return fromMinorUnitsNumber(minor, 'EUR');
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

function renderOrders(account) {
  if (!selectors.ordersList) return;
  const orders = account.orders || [];
  if (orders.length === 0) {
    selectors.ordersList.innerHTML = '<p class="account-empty">Aucune commande enregistrée. Finalisez un achat pour la voir ici.</p>';
    return;
  }
  selectors.ordersList.innerHTML = orders.map((order) => {
    const items = order.items || [];
    const totals = order.totals || {};
    return `
      <article class="account-order">
        <header class="account-order__header">
          <div>
            <h3>Commande ${order.id}</h3>
            <p class="account-muted">${dateFormatter.format(new Date(order.date))}</p>
          </div>
          <span class="account-badge account-badge--success">${order.status}</span>
        </header>
        <div class="account-order__body">
          <div>
            <p class="account-order__label">Articles</p>
            <ul>
              ${items.map((item) => `
                <li>${item.name} × ${item.qty} <span>${currency.format(minorToDisplay(multiplyMinorUnits(toMoneyMinor(item.price), item.qty)))}</span></li>
              `).join('')}
            </ul>
          </div>
          <div>
            <p class="account-order__label">Livraison</p>
            <p>${order.address?.line || ''}</p>
            <p>${order.address?.postalCode || ''} ${order.address?.city || ''}</p>
            <p>${order.address?.country || ''}</p>
            <p class="account-muted">${order.delivery?.methodLabel || ''}</p>
          </div>
          <div>
            <p class="account-order__label">Total</p>
            <p>${currency.format(minorToDisplay(toMoneyMinor(totals.total || 0)))}</p>
            <p class="account-muted">Sous-total ${currency.format(minorToDisplay(toMoneyMinor(totals.subtotal || 0)))}</p>
            <p class="account-muted">Livraison ${currency.format(minorToDisplay(toMoneyMinor(totals.shipping || 0)))}</p>
            <p class="account-muted">TVA ${currency.format(minorToDisplay(toMoneyMinor(totals.tax || 0)))}</p>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

function renderAccount(email) {
  if (selectors.activeEmail) {
    selectors.activeEmail.textContent = email ? `Commandes associées à ${email}` : 'Aucun compte sélectionné';
  }
  if (!email) {
    setStatus('Ajoutez votre email ou connectez-vous pour accéder à vos commandes.', 'info');
    renderProfile({ profile: null, addresses: [], orders: [] });
    renderAddresses({ addresses: [] });
    renderOrders({ orders: [] });
    return;
  }
  const account = getAccount(email);
  renderProfile(account);
  renderAddresses(account);
  renderOrders(account);
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
  initAnalytics();
  initHeader();
  initAuth();
  initCartDrawer();
  await renderTexts();
  await updateBadge();

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