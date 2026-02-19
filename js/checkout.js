import { initHeader } from './modules/header.js';
import { initAuth } from './modules/auth.js';
import { initCartDrawer } from './modules/cartDrawer.js';
import { clearCart, loadCart, updateBadge } from './modules/cart.js';
import { showToast } from './modules/toast.js';
import { renderTexts } from './modules/renderTexts.js';
import { addAddress, addOrder, setActiveEmail, upsertProfile } from './modules/accountData.js';
import { initAnalytics, trackAnalyticsEvent } from './modules/analytics.js';
import { buildCheckoutPayload, confirmStripePayment, createPaymentIntent, generateIdempotencyKey, storeGuestSession } from './modules/guestCheckoutApi.js';
import {
  fromMinorUnitsNumber,
  multiplyMinorUnits,
  multiplyMinorUnitsRatio,
  sumMinorUnits,
  toMinorUnitsDecimalString,
} from './modules/money.js';

const currency = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

const state = {
  subtotalMinor: 0n,
  shippingMinor: 0n,
  taxMinor: 0n,
  totalMinor: 0n,
};

let checkoutItemsState = [];

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
  paymentMethods: Array.from(document.querySelectorAll('input[name="paymentMethod"]')),
};

function minorToDecimal(minorUnits) {
  return fromMinorUnitsNumber(minorUnits, 'EUR');
}

function toMoneyMinor(value) {
  return toMinorUnitsDecimalString(String(value), 'EUR');
}

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

function getZoneMultiplierRatio(zone) {
  switch (zone) {
    case 'nord':
      return { numerator: 110, denominator: 100 };
    case 'sud':
      return { numerator: 105, denominator: 100 };
    case 'hors-zone':
      return { numerator: 140, denominator: 100 };
    default:
      return { numerator: 100, denominator: 100 };
  }
}

function calculateShippingMinor(subtotalMinor) {
  const method = selectors.deliveryMethod.value;
  const zone = selectors.deliveryZone.value;
  const { numerator, denominator } = getZoneMultiplierRatio(zone);
  const freeShippingThresholdMinor = toMoneyMinor('700');

  let baseMinor = 0n;
  if (method === 'standard') {
    baseMinor = subtotalMinor >= freeShippingThresholdMinor ? 0n : toMoneyMinor('25');
  } else if (method === 'express') {
    baseMinor = sumMinorUnits([
      toMoneyMinor('35'),
      multiplyMinorUnitsRatio(subtotalMinor, 3, 100),
    ]);
  }

  const insuranceMinor = selectors.deliveryInsurance.checked
    ? multiplyMinorUnitsRatio(subtotalMinor, 2, 100)
    : 0n;

  return multiplyMinorUnitsRatio(sumMinorUnits([baseMinor, insuranceMinor]), numerator, denominator);
}

function calculateTaxMinor(subtotalMinor, shippingMinor) {
  const country = selectors.country.value;
  const isExempt = selectors.taxExempt.checked;
  const taxableMinor = sumMinorUnits([subtotalMinor, shippingMinor]);
  if (country === 'Mayotte' || isExempt) {
    return 0n;
  }
  return multiplyMinorUnitsRatio(taxableMinor, 20, 100);
}

function updateTotals() {
  state.shippingMinor = calculateShippingMinor(state.subtotalMinor);
  state.taxMinor = calculateTaxMinor(state.subtotalMinor, state.shippingMinor);
  state.totalMinor = sumMinorUnits([state.subtotalMinor, state.shippingMinor, state.taxMinor]);

  selectors.subtotal.textContent = currency.format(minorToDecimal(state.subtotalMinor));
  selectors.shipping.textContent = currency.format(minorToDecimal(state.shippingMinor));
  selectors.tax.textContent = currency.format(minorToDecimal(state.taxMinor));
  selectors.total.textContent = currency.format(minorToDecimal(state.totalMinor));

  selectors.taxNotice.textContent =
    state.taxMinor === 0n
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

  checkoutItemsState = entries.map(([id, item]) => ({
    id,
    name: item.name,
    qty: item.qty,
    unitMinor: toMoneyMinor(item.price),
  }));

  if (checkoutItemsState.length > 0) {
    const lineMinors = checkoutItemsState.map((item) => multiplyMinorUnits(item.unitMinor, item.qty));
    const beginCheckoutValueMinor = sumMinorUnits(lineMinors);
    await trackAnalyticsEvent('begin_checkout', {
      currency: 'EUR',
      value: minorToDecimal(beginCheckoutValueMinor),
      items: checkoutItemsState.map((item) => ({
        item_id: item.id,
        item_name: item.name,
        price: minorToDecimal(item.unitMinor),
        quantity: item.qty,
      })),
    });
  }

  selectors.items.innerHTML = '';
  state.subtotalMinor = 0n;

  if (checkoutItemsState.length === 0) {
    selectors.items.innerHTML = '<p>Votre panier est vide pour le moment.</p>';
    updateTotals();
    return;
  }

  const lineMinors = [];
  checkoutItemsState.forEach((item) => {
    const lineTotalMinor = multiplyMinorUnits(item.unitMinor, item.qty);
    lineMinors.push(lineTotalMinor);

    selectors.items.insertAdjacentHTML('beforeend', `
      <div class="checkout__item" data-id="${item.id}">
        <div>
          <div class="checkout__item-title">${item.name}</div>
          <div class="checkout__item-meta">Quantité : ${item.qty}</div>
        </div>
        <strong>${currency.format(minorToDecimal(lineTotalMinor))}</strong>
      </div>
    `);
  });

  state.subtotalMinor = sumMinorUnits(lineMinors);
  updateTotals();
}

function handleInputChange() {
  updateTotals();
}

async function handleSubmit(event) {
  event.preventDefault();
  if (state.subtotalMinor === 0n) {
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

  const items = checkoutItemsState.map((item) => ({
    id: item.id,
    name: item.name,
    qty: item.qty,
    price: minorToDecimal(item.unitMinor),
  }));

  const address = {
    label: 'Livraison principale',
    fullName,
    line: formData.get('addressLine')?.toString().trim(),
    postalCode: formData.get('postalCode')?.toString().trim(),
    city: formData.get('city')?.toString().trim(),
    country: formData.get('country')?.toString().trim(),
    phone,
    lastUsed: 'Utilisée pour la dernière commande',
  };

  const paymentItems = checkoutItemsState.map((item) => ({
    id: item.id,
    quantity: item.qty,
    price: minorToDecimal(item.unitMinor),
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
      subtotal: minorToDecimal(state.subtotalMinor),
      shipping: minorToDecimal(state.shippingMinor),
      tax: minorToDecimal(state.taxMinor),
      total: minorToDecimal(state.totalMinor),
    },
    delivery: {
      method: selectors.deliveryMethod.value,
      methodLabel: selectors.deliveryMethod.options[selectors.deliveryMethod.selectedIndex]?.textContent || '',
      zone: selectors.deliveryZone.value,
      insurance: selectors.deliveryInsurance.checked,
    },
    note: formData.get('orderNote')?.toString().trim(),
    address,
  };

  await trackAnalyticsEvent('purchase', {
    transaction_id: order.id,
    currency: 'EUR',
    value: minorToDecimal(state.totalMinor),
    shipping: minorToDecimal(state.shippingMinor),
    tax: minorToDecimal(state.taxMinor),
    items: checkoutItemsState.map((item) => ({
      item_id: item.id,
      item_name: item.name,
      price: minorToDecimal(item.unitMinor),
      quantity: item.qty,
    })),
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
    selectors.taxExempt,
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