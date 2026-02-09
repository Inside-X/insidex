import { getPublishedProducts } from './productService.js';

const currencyFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR'
});

function buildProductCard(product) {
  const card = document.createElement('article');
  card.className = 'product-card';
  card.dataset.id = product.id;
  card.dataset.slug = product.slug;

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
  price.className = 'price product-price';
  if (product.oldPrice) {
    const oldPrice = document.createElement('span');
    oldPrice.className = 'old';
    oldPrice.textContent = currencyFormatter.format(product.oldPrice);
    price.appendChild(oldPrice);
  }
  const currentPrice = document.createElement('span');
  currentPrice.className = 'current';
  currentPrice.textContent = currencyFormatter.format(product.price);
  price.appendChild(currentPrice);

  const benefit = document.createElement('p');
  benefit.className = 'product-benefit';
  benefit.textContent = product.benefit || product.shortDescription || '';

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

export async function renderProducts({
  containerSelector = '#productsGrid',
  products = null,
  showFeaturedOnly = true
} = {}) {
  const container = document.querySelector(containerSelector);
  if (!container) {
    return 0;
  }

  let visibleProducts = Array.isArray(products) ? products : await getPublishedProducts();
  if (!Array.isArray(products) && showFeaturedOnly) {
    visibleProducts = visibleProducts.filter((product) => product?.featured === true);
  }
  container.innerHTML = '';
  const fragment = document.createDocumentFragment();

  visibleProducts.forEach((product) => {
    fragment.appendChild(buildProductCard(product));
  });

  container.appendChild(fragment);
  return visibleProducts.length;
}
