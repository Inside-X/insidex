import { initHeader } from './modules/header.js';
import { initCartDrawer } from './modules/cartDrawer.js';
import { addToCart, updateBadge } from './modules/cart.js';
import { PRODUCTS } from './modules/products.js';
import { showToast } from './modules/toast.js';
import { renderTexts } from './modules/renderTexts.js';

const currency = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

function getProductId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

function renderProduct(product) {
  document.getElementById('productTitle').textContent = product.name;
  document.getElementById('productBreadcrumb').textContent = product.name;
  const img = document.getElementById('productImage');
  img.src = product.image;
  img.alt = product.name;

  document.getElementById('productPrice').textContent = currency.format(product.price);
  const oldPrice = document.getElementById('productOldPrice');
  oldPrice.textContent = currency.format(product.oldPrice);

  document.getElementById('productDescription').textContent = product.description;

  const features = document.getElementById('productFeatures');
  features.innerHTML = '';
  product.features.forEach((feature) => {
    const li = document.createElement('li');
    li.textContent = feature;
    features.appendChild(li);
  });

  const addBtn = document.getElementById('productAddBtn');
  addBtn.addEventListener('click', () => {
    addToCart(product.id, product.name, product.price);
    showToast(`✅ ${product.name} ajouté au panier`, 'success');
  });
}

function renderNotFound() {
  document.getElementById('productTitle').textContent = 'Produit introuvable';
  document.getElementById('productBreadcrumb').textContent = 'Introuvable';
  document.getElementById('productDescription').textContent =
    'Ce produit n’existe pas ou le lien est incorrect.';
  document.getElementById('productFeatures').innerHTML = '';
  document.getElementById('productOldPrice').textContent = '';
  document.getElementById('productPrice').textContent = '';
  document.getElementById('productAddBtn').disabled = true;
}

document.addEventListener('DOMContentLoaded', async () => {
  initHeader();
  initCartDrawer();
  updateBadge();
  await renderTexts();

  const productId = getProductId();
  const product = productId ? PRODUCTS[productId] : null;

  if (product) {
    renderProduct(product);
  } else {
    renderNotFound();
  }
});
