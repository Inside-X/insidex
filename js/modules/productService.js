import { loadJson } from './dataLoader.js';

const PRODUCT_DATA_URL = '/api/products';
const LOCAL_STORAGE_KEY = 'insideX.products';
let cachedProducts = null;

function readLocalProducts() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }
  const stored = window.localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!stored) {
    return null;
  }
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    console.error('Erreur lecture produits locaux:', error);
    return null;
  }
}

function writeLocalProducts(products) {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(products));
}

async function fetchProducts(params = {}) {
  const query = new URLSearchParams(params);
  const url = query.toString()
    ? `${PRODUCT_DATA_URL}?${query.toString()}`
    : PRODUCT_DATA_URL;
  const data = await loadJson(url, { cache: 'no-store' });
  return Array.isArray(data) ? data : [];
}

async function getProductsSource() {
  const localProducts = readLocalProducts();
  if (Array.isArray(localProducts)) {
    cachedProducts = localProducts;
    return localProducts;
  }
  if (!Array.isArray(cachedProducts)) {
    cachedProducts = await fetchProducts();
  }
  return cachedProducts;
}

export async function getAllProducts() {
  return getProductsSource();
}

export async function getPublishedProducts() {
  const products = await getProductsSource();
  return products
    .filter((product) => product?.published === true)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export async function getProductBySlug(slug) {
  if (!slug) {
    return null;
  }
  const products = await getProductsSource();
  return products.find((product) => product.slug === slug) || null;
}

export async function getProductById(id) {
  if (!id) {
    return null;
  }
  const products = await getProductsSource();
  return products.find((product) => product.id === id) || null;
}

export function saveProducts(products) {
  if (!Array.isArray(products)) {
    return;
  }
  cachedProducts = products;
  writeLocalProducts(products);
}