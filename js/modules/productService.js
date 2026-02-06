import { loadJson } from './dataLoader.js';

const PRODUCT_DATA_URL = 'data/products.json';
let cachedProducts = null;

async function fetchProducts() {
  if (Array.isArray(cachedProducts)) {
    return cachedProducts;
  }

  const data = await loadJson(PRODUCT_DATA_URL, { cache: 'no-store' });
  cachedProducts = Array.isArray(data) ? data : [];
  return cachedProducts;
}

export async function getAllProducts() {
  return fetchProducts();
}

export async function getPublishedProducts() {
  const products = await fetchProducts();
  return products
    .filter((product) => product?.published === true)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export async function getProductBySlug(slug) {
  if (!slug) {
    return null;
  }
  const products = await fetchProducts();
  return products.find((product) => product.slug === slug) || null;
}