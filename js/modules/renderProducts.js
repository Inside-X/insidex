import { loadJson } from './dataLoader.js';

const currencyFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR'
});

function buildProductCard(product) {
  const card = document.createElement('article');
  card.className = 'product-card';
  card.dataset.id = product.id;

  const image = document.createElement('img');
  image.src = product.images?.[0] || '';
  image.alt = product.title;
  image.loading = 'lazy';
  image.decoding = 'async';

  const info = document.createElement('div');
  info.className = 'product-info';

  const title = document.createElement('h3');
  title.textContent = product.title;

  const price = document.createElement('p');
  price.className = 'price';
  price.textContent = currencyFormatter.format(product.price);

  const button = document.createElement('button');
  button.className = 'btn add-to-cart';
  button.type = 'button';
  button.dataset.id = product.id;
  button.dataset.product = product.title;
  button.dataset.price = product.price;
  button.textContent = 'Ajouter';

  info.append(title, price, button);
  card.append(image, info);

  return card;
}

const DEFAULT_VISIBILITY_FLAGS = {
  published: true,
  featured: true
};

function isProductVisible(product, requiredFlags = DEFAULT_VISIBILITY_FLAGS) {
  if (!product || typeof product !== 'object') {
    return false;
  }

  return Object.entries(requiredFlags).every(
    ([flag, requiredValue]) => product[flag] === requiredValue
  );
}

export async function renderProducts({
  containerSelector = '#productsGrid',
  dataUrl = 'data/products.json'
} = {}) {
  const container = document.querySelector(containerSelector);
  if (!container) {
    return 0;
  }

  const products = await loadJson(dataUrl);
  const visibleProducts = products.filter((product) => isProductVisible(product));

  container.innerHTML = '';
  const fragment = document.createDocumentFragment();

  visibleProducts.forEach((product) => {
    fragment.appendChild(buildProductCard(product));
  });

  container.appendChild(fragment);
  return visibleProducts.length;
}
