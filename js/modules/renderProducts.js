import { getPublishedProducts } from './productService.js';

const currencyFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR'
});

function placeholderImage() {
  return {
    url: 'assets/images/placeholder.png',
    alt: 'Produit Inside X',
    width: 640,
    height: 480,
    position: 0,
  };
}

function buildProductCard(product) {
  const card = document.createElement('article');
  card.className = 'product-card';
  card.dataset.id = product.id;
  card.dataset.slug = product.slug;
  card.setAttribute('data-testid', 'product-card');

  const imageData = product.imageObjects?.[0] || placeholderImage();

  const image = document.createElement('img');
  image.src = imageData.url;
  image.alt = imageData.alt || product.title || 'Produit';
  image.loading = 'lazy';
  image.decoding = 'async';
  image.width = Number(imageData.width) || 640;
  image.height = Number(imageData.height) || 480;

  const info = document.createElement('div');
  info.className = 'product-info';

  const title = document.createElement('h3');
  title.textContent = product.title;

  const price = document.createElement('p');
  price.className = 'price product-price';
  const currentPrice = document.createElement('span');
  currentPrice.className = 'current';
  currentPrice.textContent = currencyFormatter.format(Number(product.price) || 0);
  price.appendChild(currentPrice);

  const benefit = document.createElement('p');
  benefit.className = 'product-benefit';
  benefit.textContent = product.shortDescription || '';

  const button = document.createElement('button');
  button.className = 'btn add-to-cart';
  button.type = 'button';
  button.dataset.id = product.id;
  button.dataset.product = product.title;
  button.dataset.price = product.price;
  button.textContent = 'Ajouter';

  info.append(title, price, benefit, button);
  card.append(image, info);

  return card;
}

function renderLoadingState(container) {
  container.innerHTML = '';
  const skeleton = document.createElement('div');
  skeleton.className = 'products-loading';
  skeleton.setAttribute('data-testid', 'products-loading');
  skeleton.textContent = 'Chargement des produits…';
  container.appendChild(skeleton);
}

function renderEmptyState(container) {
  container.innerHTML = '';
  const empty = document.createElement('p');
  empty.className = 'products-empty';
  empty.setAttribute('data-testid', 'products-empty');
  empty.textContent = 'Aucun produit disponible pour le moment.';
  container.appendChild(empty);
}

function renderErrorState(container) {
  container.innerHTML = '';
  const error = document.createElement('p');
  error.className = 'products-error';
  error.setAttribute('data-testid', 'products-error');
  error.textContent = 'Impossible de charger les produits. Veuillez réessayer.';
  container.appendChild(error);
}

export async function renderProducts({
  containerSelector = '#productsGrid',
  products = null,
} = {}) {
  const container = document.querySelector(containerSelector);
  if (!container) {
    return 0;
  }

  container.setAttribute('data-testid', 'product-grid');

  let visibleProducts = [];
  if (Array.isArray(products)) {
    visibleProducts = products;
  } else {
    renderLoadingState(container);
    try {
      visibleProducts = await getPublishedProducts();
    } catch (error) {
      console.error('Erreur chargement catalogue:', error);
      renderErrorState(container);
      return 0;
    }
  }

  if (!Array.isArray(visibleProducts) || visibleProducts.length === 0) {
    renderEmptyState(container);
    return 0;
  }
  
  container.innerHTML = '';
  const fragment = document.createDocumentFragment();

  visibleProducts.forEach((product) => {
    fragment.appendChild(buildProductCard(product));
  });

  container.appendChild(fragment);
  return visibleProducts.length;
}
