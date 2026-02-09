import { loadJson } from './dataLoader.js';

const PRODUCT_DATA_URL = '/api/products';
let cachedProducts = null;

async function fetchProducts(params = {}) {
  const query = new URLSearchParams(params);
  const url = query.toString()
    ? `${PRODUCT_DATA_URL}?${query.toString()}`
    : PRODUCT_DATA_URL;
  const data = await loadJson(url, { cache: 'no-store' });
  return Array.isArray(data) ? data : [];
}

export async function getAllProducts() {
  if (!Array.isArray(cachedProducts)) {
    cachedProducts = await fetchProducts();
  }
  return cachedProducts;
}

export async function getPublishedProducts() {
  const products = await fetchProducts({ published: 'true' });
  return products.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export async function getProductBySlug(slug) {
  if (!slug) {
    return null;
  }
  return loadJson(`${PRODUCT_DATA_URL}?slug=${encodeURIComponent(slug)}`, { cache: 'no-store' });
}

export async function getProductById(id) {
  if (!id) {
    return null;
  }
  return loadJson(`${PRODUCT_DATA_URL}/${encodeURIComponent(id)}`, { cache: 'no-store' });
}