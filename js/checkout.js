import { initHeader } from './modules/header.js';
import { initAuth } from './modules/auth.js';
import { initCartDrawer } from './modules/cartDrawer.js';
import { clearCart, loadCart, updateBadge } from './modules/cart.js';
import { showToast } from './modules/toast.js';
import { renderTexts } from './modules/renderTexts.js';
import { addAddress, addOrder, setActiveEmail, upsertProfile } from './modules/accountData.js';
import { initAnalytics, trackAnalyticsEvent } from './modules/analytics.js';
import { buildCheckoutPayload, confirmStripePayment, createPaymentIntent, generateIdempotencyKey, storeGuestSession } from './modules/guestCheckoutApi.js';

const currency = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

const state = {
  subtotal: 0,
  shipping: 0,
  tax: 0,
  total: 0
};

const selectors = {
  items: document.getElementById('checkoutItems'),
  subtotal: document.getElementById('subtotalAmount'),
  shipping: document.getElementById('shippingAmount'),
  tax: document.getElementById('taxAmount'),
  total: document.getElementById('totalAmount'),
  shippingNotice: document.getElementById('shippingNotice'),
  taxNotice: document.getElementById('taxNotice'),
  deliveryMethod: document.getElementById('deliveryMethod'),
  deliveryZone: document.getElementById('deliveryZone'),
  deliveryInsurance: document.getElementById('deliveryInsurance'),
  country: document.getElementById('country'),
  taxExempt: document.getElementById('taxExempt'),
  form: document.getElementById('checkoutForm'),
  paymentStatus: document.getElementById('paymentStatus'),
  paymentOutcome: document.getElementById('paymentOutcome'),
  cardFields: document.getElementById('cardFields'),
  paymentMethods: Array.from(document.querySelectorAll('input[name="paymentMethod"]'))
};

function getSelectedPaymentMethod() {
  return selectors.paymentMethods.find((input) => input.checked)?.value ?? 'stripe';
}

function updatePaymentFields() {
  const method = getSelectedPaymentMethod();
  const showCard = method === 'card' || method === 'stripe';
  selectors.cardFields.style.display = showCard ? 'grid' : 'none';
  document.getElementById('cardNumber').required = showCard;
  document.getElementById('cardExpiry').required = showCard;
  document.getElementById('cardCvc').required = showCard;
}

function setPaymentStatus(message, status = '') {
  selectors.paymentStatus.textContent = message;
  selectors.paymentStatus.classList.remove('is-success', 'is-error', 'is-processing');
  if (status) {
    selectors.paymentStatus.classList.add(`is-${status}`);
  }
}

async function processPayment({ paymentIntent, testOutcome }) {
  const method = getSelectedPaymentMethod();
  setPaymentStatus(`Traitement du paiement via ${method.toUpperCase()}...`, 'processing');

  if (method === 'paypal') {
    if (testOutcome === 'failure') {
      setPaymentStatus('Paiement PayPal refusé ❌ (mode test).', 'error');
      return false;
    }
    setPaymentStatus('Paiement PayPal accepté ✅', 'success');
    return true;
  }

  const result = await confirmStripePayment({
    clientSecret: paymentIntent.clientSecret,
    testOutcome,
  });

  if (!result.ok) {
    setPaymentStatus(result.message, 'error');
    return false;
  }

  setPaymentStatus('Paiement accepté ✅ Votre commande est confirmée.', 'success');
  return true;
}

function getZoneMultiplier(zone) {
  switch (zone) {
    case 'nord':
      return 1.1;
    case 'sud':
      return 1.05;
    case 'hors-zone':
      return 1.4;
    default:
      return 1;
  }
}

function calculateShipping(subtotal) {
  const method = selectors.deliveryMethod.value;
  const zone = selectors.deliveryZone.value;
  const multiplier = getZoneMultiplier(zone);

  let base = 0;
  if (method === 'standard') {
    base = subtotal >= 700 ? 0 : 25;
  } else if (method === 'express') {
    base = 35 + subtotal * 0.03;
  } else if (method === 'pickup') {
    base = 0;
  }

  const insurance = selectors.deliveryInsurance.checked ? subtotal * 0.02 : 0;
  return (base + insurance) * multiplier;
}

function calculateTax(subtotal, shipping) {
  const country = selectors.country.value;
  const isExempt = selectors.taxExempt.checked;
  const rate = country === 'Mayotte' || isExempt ? 0 : 0.2;
  return (subtotal + shipping) * rate;
}

function updateTotals() {
  state.shipping = calculateShipping(state.subtotal);
  state.tax = calculateTax(state.subtotal, state.shipping);
  state.total = state.subtotal + state.shipping + state.tax;

  selectors.subtotal.textContent = currency.format(state.subtotal);
  selectors.shipping.textContent = currency.format(state.shipping);
  selectors.tax.textContent = currency.format(state.tax);
  selectors.total.textContent = currency.format(state.total);

  selectors.taxNotice.textContent =
    state.tax === 0
      ? 'TVA non applicable à Mayotte ou exonération activée.'
      : 'TVA appliquée selon le pays de livraison.';

  selectors.shippingNotice.textContent =
    selectors.deliveryMethod.value === 'pickup'
      ? 'Retrait gratuit au showroom (Mamoudzou).'
      : 'Frais calculés selon la zone et le mode de livraison.';
}

async function renderCartSummary() {
  const cart = await loadCart();
  const entries = Object.entries(cart.items);

  if (entries.length > 0) {
    await trackAnalyticsEvent('begin_checkout', {
      currency: 'EUR',
      value: entries.reduce((sum, [, item]) => sum + (item.price * item.qty), 0),
      items: entries.map(([id, item]) => ({
        item_id: id,
        item_name: item.name,
        price: item.price,
        quantity: item.qty
      }))
    });
  }
  selectors.items.innerHTML = '';
  state.subtotal = 0;

  if (entries.length === 0) {
    selectors.items.innerHTML = '<p>Votre panier est vide pour le moment.</p>';
    updateTotals();
    return;
  }

  entries.forEach(([id, item]) => {
    const lineTotal = item.price * item.qty;
    state.subtotal += lineTotal;
    selectors.items.insertAdjacentHTML('beforeend', `
      <div class="checkout__item" data-id="${id}">
        <div>
          <div class="checkout__item-title">${item.name}</div>
          <div class="checkout__item-meta">Quantité : ${item.qty}</div>
        </div>
        <strong>${currency.format(lineTotal)}</strong>
      </div>
    `);
  });

  updateTotals();
}

function handleInputChange() {
  updateTotals();
}

async function handleSubmit(event) {
  event.preventDefault();
  if (state.subtotal === 0) {
    showToast('Votre panier est vide. Ajoutez un produit pour finaliser.', 'warning');
    return;
  }

  if (!selectors.form.checkValidity()) {
    selectors.form.reportValidity();
    return;
  }

  const formData = new FormData(selectors.form);
  const email = formData.get('email')?.toString().trim();
  const fullName = formData.get('fullName')?.toString().trim();
  const phone = formData.get('phone')?.toString().trim();
  const cart = await loadCart();
  const items = Object.entries(cart.items).map(([id, item]) => ({
    id,
    name: item.name,
    qty: item.qty,
    price: item.price
  }));
  const address = {
    label: 'Livraison principale',
    fullName,
    line: formData.get('addressLine')?.toString().trim(),
    postalCode: formData.get('postalCode')?.toString().trim(),
    city: formData.get('city')?.toString().trim(),
    country: formData.get('country')?.toString().trim(),
    phone,
    lastUsed: 'Utilisée pour la dernière commande'
  };
  const paymentItems = items.map((item) => ({
    id: item.id,
    quantity: item.qty,
    price: item.price,
  }));

  const checkoutPayload = buildCheckoutPayload({
    email,
    address: {
      line1: address.line,
      city: address.city,
      postalCode: address.postalCode,
      country: address.country,
    },
    items: paymentItems,
    idempotencyKey: generateIdempotencyKey(),
  });

  const accessToken = localStorage.getItem('insidex_access_token');
  let paymentIntent;

  try {
    const paymentIntentResponse = await createPaymentIntent(checkoutPayload, accessToken);
    paymentIntent = paymentIntentResponse.data;
    storeGuestSession(paymentIntentResponse.meta, email);
  } catch (error) {
    setPaymentStatus(error.message || 'Paiement indisponible.', 'error');
    showToast(error.message || "Impossible d'initialiser le paiement.", 'error');
    return;
  }

  const paymentSuccess = await processPayment({
    paymentIntent,
    testOutcome: selectors.paymentOutcome.value,
  });
  if (!paymentSuccess) {
    showToast('Le paiement a échoué. Votre panier reste disponible.', 'error');
    return;
  }

  const order = {
  id: paymentIntent?.metadata?.orderId || `CMD-${Date.now().toString(36).toUpperCase()}`,
    date: new Date().toISOString(),
    status: 'Confirmée',
    items,
    totals: {
      subtotal: state.subtotal,
      shipping: state.shipping,
      tax: state.tax,
      total: state.total
    },
    delivery: {
      method: selectors.deliveryMethod.value,
      methodLabel: selectors.deliveryMethod.options[selectors.deliveryMethod.selectedIndex]?.textContent || '',
      zone: selectors.deliveryZone.value,
      insurance: selectors.deliveryInsurance.checked
    },
    note: formData.get('orderNote')?.toString().trim(),
    address
  };

  await trackAnalyticsEvent('purchase', {
    transaction_id: order.id,
    currency: 'EUR',
    value: state.total,
    shipping: state.shipping,
    tax: state.tax,
    items: items.map((item) => ({
      item_id: item.id,
      item_name: item.name,
      price: item.price,
      quantity: item.qty
    }))
  });

  if (email) {
    upsertProfile(email, { name: fullName, email, phone });
    addAddress(email, address);
    addOrder(email, order);
    setActiveEmail(email);
  }

  if (document.getElementById('createAccountAfterPayment')?.checked) {
    showToast('✅ Vous pourrez finaliser la création de votre compte depuis votre espace client.', 'success');
  }
 
  await clearCart();
  await updateBadge();
  await renderCartSummary();
  showToast('✅ Commande finalisée ! Un conseiller vous recontacte rapidement.', 'success');
  selectors.form.reset();
  selectors.paymentOutcome.value = 'success';
  selectors.paymentMethods[0].checked = true;
  updatePaymentFields();
  updateTotals();
}

document.addEventListener('DOMContentLoaded', async () => {
  initAnalytics();
  initHeader();
  initAuth();
  initCartDrawer();
  await renderTexts();
  await updateBadge();
  await renderCartSummary();

  [
    selectors.deliveryMethod,
    selectors.deliveryZone,
    selectors.deliveryInsurance,
    selectors.country,
    selectors.taxExempt
  ].forEach((input) => {
    input.addEventListener('change', handleInputChange);
  });

  selectors.paymentMethods.forEach((input) => {
    input.addEventListener('change', updatePaymentFields);
  });

  selectors.form.addEventListener('submit', handleSubmit);
  updatePaymentFields();
  setPaymentStatus('Prêt à initier un paiement sécurisé.');
});