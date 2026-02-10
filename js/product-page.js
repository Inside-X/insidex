import { initHeader } from './modules/header.js';
import { initAuth } from './modules/auth.js';
import { initCartDrawer } from './modules/cartDrawer.js';
import { addToCart, updateBadge } from './modules/cart.js';
import { getProductById, getProductBySlug } from './modules/productService.js';
import { showToast } from './modules/toast.js';
import { renderTexts } from './modules/renderTexts.js';
import { initRoleSimulation } from './modules/role.js';
import { initLeadCapture } from './modules/leadCapture.js';

const currency = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

function getProductSlug() {
  const params = new URLSearchParams(window.location.search);
  const pathMatch = window.location.pathname.match(/^\/produits\/([^/]+)$/);
  const pathSlug = pathMatch ? decodeURIComponent(pathMatch[1]) : null;
  
  return {
    slug: params.get('slug') || pathSlug,
    id: params.get('id')
  };
}


function getSiteOrigin() {
  return window.location.origin || 'https://insidex.example';
}

function updateSeoMeta(product) {
  const origin = getSiteOrigin();
  const canonicalPath = product.slug
    ? `/produits/${encodeURIComponent(product.slug)}`
    : `/product.html?id=${encodeURIComponent(product.id)}`;
  const canonicalUrl = `${origin}${canonicalPath}`;
  const title = `${product.title} | Inside X`;
  const description = (product.shortDescription || product.description || '').trim()
    || `Découvrez ${product.title} sur Inside X.`;
  const imagePath = product.images?.[0] || 'assets/images/logo-inside-home.png';
  const imageUrl = imagePath.startsWith('http') ? imagePath : `${origin}/${imagePath.replace(/^\//, '')}`;

  document.title = title;

  const updateMeta = (selector, attr, value) => {
    const element = document.querySelector(selector);
    if (element) {
      element.setAttribute(attr, value);
    }
  };

  updateMeta('meta[name="description"]', 'content', description);
  updateMeta('meta[name="robots"]', 'content', 'index,follow');
  updateMeta('meta[property="og:title"]', 'content', title);
  updateMeta('meta[property="og:description"]', 'content', description);
  updateMeta('meta[property="og:image"]', 'content', imageUrl);
  updateMeta('meta[property="og:url"]', 'content', canonicalUrl);
  updateMeta('link[rel="canonical"]', 'href', canonicalUrl);
}

function updateSeoNotFound() {
  document.title = 'Produit introuvable | Inside X';
  const noIndex = document.querySelector('meta[name="robots"]');
  if (noIndex) {
    noIndex.setAttribute('content', 'noindex,nofollow');
  }
}

function renderProduct(product) {
  updateSeoMeta(product);
  document.getElementById('productTitle').textContent = product.title;
  document.getElementById('productBreadcrumb').textContent = product.title;
  const img = document.getElementById('productImage');
  img.src = product.images?.[0] || 'assets/images/placeholder.png';
  img.alt = product.title;

  document.getElementById('productPrice').textContent = currency.format(product.price);
  const oldPrice = document.getElementById('productOldPrice');
  oldPrice.textContent = product.oldPrice ? currency.format(product.oldPrice) : '';

  document.getElementById('productDescription').textContent =
    product.shortDescription || product.description || '';

  const features = document.getElementById('productFeatures');
  features.innerHTML = '';

  const addBtn = document.getElementById('productAddBtn');
  addBtn.disabled = false;
  addBtn.addEventListener('click', async () => {
    await addToCart(product.id, product.title, product.price);
    showToast(`✅ ${product.title} ajouté au panier`, 'success');
  });
  
  const sections = [
    { id: 'productDesignation', value: product.designation || product.title },
    { id: 'productLongDescription', value: product.description },
    { id: 'productDimensions', value: product.dimensions },
    { id: 'productGeneralFeatures', value: product.generalFeatures },
    { id: 'productMaterials', value: product.materials },
    { id: 'productComfort', value: product.comfort },
    { id: 'productAdvantages', value: product.advantages },
    { id: 'productPackaging', value: product.packaging }
  ];

  sections.forEach(({ id, value }) => {
    const element = document.getElementById(id);
    if (!element) {
      return;
    }
    const text = value || '';
    element.textContent = text;
    const wrapper = element.closest('.product-section');
    if (wrapper) {
      wrapper.hidden = text.trim().length === 0;
    }
  });
}

function renderNotFound() {
  updateSeoNotFound();
  document.getElementById('productTitle').textContent = 'Produit introuvable';
  document.getElementById('productBreadcrumb').textContent = 'Introuvable';
  document.getElementById('productDescription').textContent =
    'Ce produit n’existe pas ou le lien est incorrect.';
  document.getElementById('productFeatures').innerHTML = '';
  document.getElementById('productOldPrice').textContent = '';
  document.getElementById('productPrice').textContent = '';
  document.getElementById('productAddBtn').disabled = true;

  [
    'productDesignation',
    'productLongDescription',
    'productDimensions',
    'productGeneralFeatures',
    'productMaterials',
    'productComfort',
    'productAdvantages',
    'productPackaging'
  ].forEach((id) => {
    const element = document.getElementById(id);
    if (!element) {
      return;
    }
    element.textContent = '';
    const wrapper = element.closest('.product-section');
    if (wrapper) {
      wrapper.hidden = true;
    }
  });
}

async function resolveProduct() {
  const { slug, id } = getProductSlug();
  if (slug) {
    return getProductBySlug(slug);
  }
  if (id) {
    return getProductById(id);
  }
  return null;
}

document.addEventListener('DOMContentLoaded', async () => {
  initRoleSimulation();
  initHeader();
  initAuth();
  initCartDrawer();
  await updateBadge();
  await renderTexts();
  initLeadCapture();

  const product = await resolveProduct();

  if (product) {
    renderProduct(product);
  } else {
    renderNotFound();
  }
});
