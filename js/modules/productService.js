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

function normalizeListItem(item) {
  const primaryImage = item?.primaryImage || null;
  const amount = Number(item?.pricePreview?.amount);

  return {
    id: item?.id,
    slug: item?.slug,
    title: item?.name || '',
    name: item?.name || '',
    images: primaryImage ? [primaryImage.url] : [],
    imageObjects: primaryImage ? [primaryImage] : [],
    price: Number.isFinite(amount) ? amount : 0,
    currency: item?.pricePreview?.currency || 'EUR',
    stock: item?.stock || { status: 'unknown', quantity: null, backorderable: false },
    published: true,
    featured: true,
  };
}

function normalizeDetailItem(item) {
  const amount = Number(item?.pricePreview?.amount ?? item?.basePrice?.amount);
  const currency = item?.pricePreview?.currency || item?.basePrice?.currency || 'EUR';

  return {
    id: item?.id,
    slug: item?.slug,
    title: item?.name || '',
    name: item?.name || '',
    description: item?.description || '',
    shortDescription: item?.description || '',
    images: Array.isArray(item?.images)
      ? item.images.map((image) => image.url)
      : [],
    imageObjects: Array.isArray(item?.images) ? item.images : [],
    price: Number.isFinite(amount) ? amount : 0,
    currency,
    stock: item?.stock || { status: 'unknown', quantity: null, backorderable: false },
    variants: Array.isArray(item?.variants) ? item.variants : [],
    specs: Array.isArray(item?.specs) ? item.specs : [],
  };
}

async function fetchProducts(params = {}) {
  const query = new URLSearchParams(params);
  const url = query.toString()
    ? `${PRODUCT_DATA_URL}?${query.toString()}`
    : PRODUCT_DATA_URL;
  const data = await loadJson(url, { cache: 'no-store' });

  if (Array.isArray(data)) {
    return data;
  }

  const items = data?.data?.items;
  if (Array.isArray(items)) {
    return items.map(normalizeListItem);
  }

  return [];
}

async function fetchProductDetailBySlug(slug) {
  const data = await loadJson(`${PRODUCT_DATA_URL}/${encodeURIComponent(slug)}`, { cache: 'no-store' });
  if (data?.data) {
    return normalizeDetailItem(data.data);
  }
  return null;
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
  return products.filter((product) => product?.published === true);
}

export async function getProductBySlug(slug) {
  if (!slug) {
    return null;
  }

  try {
    const detailedProduct = await fetchProductDetailBySlug(slug);
    if (detailedProduct) {
      return detailedProduct;
    }
  } catch (error) {
    if (!error || !String(error.message).includes('404')) {
      console.error('Erreur chargement produit détaillé:', error);
    }
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