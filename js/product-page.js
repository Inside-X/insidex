import { initHeader } from './modules/header.js';
import { initAuth } from './modules/auth.js';
import { initCartDrawer } from './modules/cartDrawer.js';
import { updateBadge } from './modules/cart.js';
import { getProductById, getProductBySlug } from './modules/productService.js';
import { showToast } from './modules/toast.js';
import { renderTexts } from './modules/renderTexts.js';
import { initLeadCapture } from './modules/leadCapture.js';
import { initAnalytics } from './modules/analytics.js';

const currency = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

const ERROR_BANNERS = {
  payments_disabled: {
    title: 'Paiements indisponibles',
    message: 'Paiements indisponibles (maintenance)',
  },
  dependency_unavailable: {
    title: 'Service temporairement indisponible',
    message: 'Une dépendance critique est indisponible. Réessayez.',
  },
};

function getProductSlug() {
  const params = new URLSearchParams(window.location.search);
  return {
    slug: params.get('slug'),
    id: params.get('id'),
  };
}

function showErrorBanner(code) {
  const banner = document.getElementById('productErrorBanner');
  if (!banner) return;

  const mapped = ERROR_BANNERS[code] || ERROR_BANNERS.dependency_unavailable;
  banner.hidden = false;
  banner.dataset.code = code;
  banner.setAttribute('data-testid', 'error-banner');
  banner.innerHTML = `<strong>${mapped.title}</strong><span>${mapped.message}</span>`;
}

function hideErrorBanner() {
  const banner = document.getElementById('productErrorBanner');
  if (!banner) return;
  banner.hidden = true;
  banner.removeAttribute('data-code');
  banner.innerHTML = '';
}

function computeDisabledReason(product, selectedVariant, dependencyUnavailable = false) {
  if (dependencyUnavailable) {
    return 'dependency_unavailable';
  }

  const variants = Array.isArray(product.variants) ? product.variants : [];
  if (variants.length > 0 && !selectedVariant) {
    return 'variant_unselected';
  }

  const stock = selectedVariant?.stock || product.stock;
  if (stock?.status === 'out_of_stock') {
    return 'out_of_stock';
  }

  return null;
}

function renderGallery(images = []) {
  const imageEl = document.getElementById('productImage');
  const galleryEl = document.getElementById('productGallery');
  if (!imageEl || !galleryEl) return;

  const ordered = [...images].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const first = ordered[0] || {
    url: 'assets/images/placeholder.png',
    alt: 'Produit Inside X',
    width: 640,
    height: 480,
  };

  imageEl.src = first.url;
  imageEl.alt = first.alt || 'Produit';
  imageEl.width = Number(first.width) || 640;
  imageEl.height = Number(first.height) || 480;

  galleryEl.innerHTML = '';
  galleryEl.setAttribute('data-testid', 'pdp-carousel');

  ordered.forEach((image, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'product-thumb';
    button.setAttribute('aria-label', `Image ${index + 1}`);

    const thumb = document.createElement('img');
    thumb.src = image.url;
    thumb.alt = image.alt || `Image ${index + 1}`;
    thumb.width = 80;
    thumb.height = 80;

    button.addEventListener('click', () => {
      imageEl.src = image.url;
      imageEl.alt = image.alt || 'Produit';
      imageEl.width = Number(image.width) || 640;
      imageEl.height = Number(image.height) || 480;
    });

    button.appendChild(thumb);
    galleryEl.appendChild(button);
  });
}

function renderVariantPicker(product, onVariantChange) {
  const container = document.getElementById('productVariantPicker');
  if (!container) return;

  const variants = Array.isArray(product.variants) ? product.variants : [];
  container.setAttribute('data-testid', 'variant-picker');

  if (variants.length === 0) {
    container.hidden = true;
    container.innerHTML = '';
    onVariantChange(null);
    return;
  }

  container.hidden = false;
  container.innerHTML = '';

  const select = document.createElement('select');
  select.id = 'variantSelect';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Choisissez une variante';
  select.appendChild(placeholder);

  variants.forEach((variant) => {
    const option = document.createElement('option');
    option.value = variant.id;
    option.textContent = variant.label;
    select.appendChild(option);
  });

  select.addEventListener('change', () => {
    const selectedVariant = variants.find((variant) => variant.id === select.value) || null;
    onVariantChange(selectedVariant);
  });

  container.appendChild(select);
  onVariantChange(null);
}

function updateCtaState(product, selectedVariant, dependencyUnavailable = false) {
  const addBtn = document.getElementById('productAddBtn');
  const reasonEl = document.getElementById('productCtaReason');
  if (!addBtn || !reasonEl) return null;

  const disabledReason = computeDisabledReason(product, selectedVariant, dependencyUnavailable);
  addBtn.setAttribute('data-testid', 'add-to-cart');

  if (disabledReason) {
    addBtn.disabled = true;
    addBtn.dataset.disabledReason = disabledReason;
    reasonEl.textContent = disabledReason;
  } else {
    addBtn.disabled = false;
    reasonEl.textContent = '';
    delete addBtn.dataset.disabledReason;
  }

  return disabledReason;
}

async function postAddToCart(payload) {
  const response = await fetch('/api/cart/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = body?.error?.code || 'dependency_unavailable';
    throw new Error(code);
  }

  return body;
}

function renderProduct(product) {
  document.getElementById('productTitle').textContent = product.title;
  document.getElementById('productBreadcrumb').textContent = product.title;
  document.getElementById('productDescription').textContent = product.description || '';

  const productPrice = document.getElementById('productPrice');
  const oldPrice = document.getElementById('productOldPrice');
  productPrice.textContent = currency.format(product.price || 0);
  oldPrice.textContent = '';

  const features = document.getElementById('productFeatures');
  features.innerHTML = '';

  renderGallery(product.imageObjects || []);

  const stockBadge = document.getElementById('productStockBadge');
  if (stockBadge) {
    stockBadge.textContent = product.stock?.status || 'unknown';
  }

  const addBtn = document.getElementById('productAddBtn');
  const quantityInput = document.getElementById('productQuantity');

  let selectedVariant = null;
  let dependencyUnavailable = false;

  renderVariantPicker(product, (variant) => {
    selectedVariant = variant;
    updateCtaState(product, selectedVariant, dependencyUnavailable);
  });

  addBtn.onclick = async () => {
    hideErrorBanner();

    const quantity = Math.max(1, Number.parseInt(quantityInput?.value || '1', 10));
    const disabledReason = updateCtaState(product, selectedVariant, dependencyUnavailable);
    if (disabledReason) {
      return;
    }

    try {
      await postAddToCart({
        productId: product.id,
        variantId: selectedVariant?.id || null,
        quantity,
      });
      await updateBadge();
      showToast(`✅ ${product.title} ajouté au panier`, 'success');
    } catch (error) {
      const code = String(error.message || '').toLowerCase();
      const normalizedCode = code.includes('payments_disabled')
        ? 'payments_disabled'
        : 'dependency_unavailable';
      dependencyUnavailable = normalizedCode === 'dependency_unavailable';
      showErrorBanner(normalizedCode);
      updateCtaState(product, selectedVariant, dependencyUnavailable);
    }
  };

  updateCtaState(product, selectedVariant, dependencyUnavailable);
}

function renderNotFound() {
  document.getElementById('productTitle').textContent = 'Produit introuvable';
  document.getElementById('productBreadcrumb').textContent = 'Introuvable';
  document.getElementById('productDescription').textContent = 'Ce produit n’existe pas ou le lien est incorrect.';
  document.getElementById('productFeatures').innerHTML = '';
  document.getElementById('productOldPrice').textContent = '';
  document.getElementById('productPrice').textContent = '';
  document.getElementById('productAddBtn').disabled = true;
  document.getElementById('productVariantPicker').hidden = true;
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
  initAnalytics();
  initHeader();
  await initAuth();
  initCartDrawer();
  await updateBadge();
  await renderTexts();
  initLeadCapture();

  hideErrorBanner();

  const product = await resolveProduct();
  if (!product) {
    renderNotFound();
    return;
  }

  renderProduct(product);
});
