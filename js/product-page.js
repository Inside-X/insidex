import { initHeader } from './modules/header.js';
import { initCartDrawer } from './modules/cartDrawer.js';
import { addToCart, updateBadge } from './modules/cart.js';
import { getAllProducts, getProductBySlug } from './modules/productService.js';
import { showToast } from './modules/toast.js';
import { renderTexts } from './modules/renderTexts.js';

const currency = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

function getProductSlug() {
  const params = new URLSearchParams(window.location.search);
  return {
    slug: params.get('slug'),
    id: params.get('id')
  };
}

function renderProduct(product) {
  document.getElementById('productTitle').textContent = product.title;
  document.getElementById('productBreadcrumb').textContent = product.title;
  const img = document.getElementById('productImage');
  img.src = product.images?.[0] || 'assets/images/placeholder.png';
  img.alt = product.title;

  document.getElementById('productPrice').textContent = currency.format(product.price);
  const oldPrice = document.getElementById('productOldPrice');
  oldPrice.textContent = '';

  document.getElementById('productDescription').textContent =
    product.description || product.shortDescription || '';

  const features = document.getElementById('productFeatures');
  features.innerHTML = '';

  const addBtn = document.getElementById('productAddBtn');
  addBtn.disabled = false;
  addBtn.addEventListener('click', () => {
    addToCart(product.id, product.title, product.price);
    showToast(`✅ ${product.title} ajouté au panier`, 'success');
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

async function resolveProduct() {
  const { slug, id } = getProductSlug();
  if (slug) {
    return getProductBySlug(slug);
  }
  if (id) {
    const products = await getAllProducts();
    return products.find((product) => product.id === id) || null;
  }
  return null;
}

document.addEventListener('DOMContentLoaded', async () => {
  initHeader();
  initCartDrawer();
  updateBadge();
  await renderTexts();

  const product = await resolveProduct();

  if (product) {
    renderProduct(product);
  } else {
    renderNotFound();
  }
});
