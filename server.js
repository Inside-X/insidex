import express from 'express';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));
app.use(express.json());

async function loadProducts() {
  const filePath = path.join(__dirname, 'data', 'products.json');
  const content = await readFile(filePath, 'utf-8');
  const products = JSON.parse(content);
  return Array.isArray(products) ? products : [];
}

const CARTS_PATH = path.join(__dirname, 'data', 'carts.json');

async function loadCarts() {
  try {
    const content = await readFile(CARTS_PATH, 'utf-8');
    const carts = JSON.parse(content);
    return {
      users: carts?.users ?? {},
      anonymous: carts?.anonymous ?? {}
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      const empty = { users: {}, anonymous: {} };
      await writeFile(CARTS_PATH, JSON.stringify(empty, null, 2), 'utf-8');
      return empty;
    }
    throw error;
  }
}

async function saveCarts(carts) {
  await writeFile(CARTS_PATH, JSON.stringify(carts, null, 2), 'utf-8');
}

function normalizeCart(cart) {
  return {
    items: cart?.items ?? {}
  };
}

function resolveCartBucket(carts, { userId, anonId }) {
  if (userId) {
    if (!carts.users[userId]) {
      carts.users[userId] = normalizeCart();
    }
    return { bucket: carts.users, key: userId };
  }
  if (!anonId) {
    return null;
  }
  if (!carts.anonymous[anonId]) {
    carts.anonymous[anonId] = normalizeCart();
  }
  return { bucket: carts.anonymous, key: anonId };
}

app.get('/api/cart', async (req, res) => {
  try {
    const carts = await loadCarts();
    const bucketInfo = resolveCartBucket(carts, {
      userId: req.query.userId,
      anonId: req.query.anonId
    });
    if (!bucketInfo) {
      return res.status(400).json({ error: 'Identifiant manquant.' });
    }
    const cart = normalizeCart(bucketInfo.bucket[bucketInfo.key]);
    return res.json(cart);
  } catch (error) {
    console.error('Erreur chargement panier:', error);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

app.post('/api/cart/items', async (req, res) => {
  try {
    const { id, name, price, qty = 1, userId, anonId } = req.body;
    if (!id || !name) {
      return res.status(400).json({ error: 'Produit invalide.' });
    }
    const carts = await loadCarts();
    const bucketInfo = resolveCartBucket(carts, { userId, anonId });
    if (!bucketInfo) {
      return res.status(400).json({ error: 'Identifiant manquant.' });
    }
    const cart = normalizeCart(bucketInfo.bucket[bucketInfo.key]);
    if (!cart.items[id]) {
      cart.items[id] = { name, price: Number(price), qty: 0 };
    }
    cart.items[id].qty += Math.max(1, Number(qty));
    bucketInfo.bucket[bucketInfo.key] = cart;
    await saveCarts(carts);
    return res.json(cart);
  } catch (error) {
    console.error('Erreur ajout panier:', error);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

app.patch('/api/cart/items/:id', async (req, res) => {
  try {
    const { userId, anonId, qty } = req.body;
    const carts = await loadCarts();
    const bucketInfo = resolveCartBucket(carts, { userId, anonId });
    if (!bucketInfo) {
      return res.status(400).json({ error: 'Identifiant manquant.' });
    }
    const cart = normalizeCart(bucketInfo.bucket[bucketInfo.key]);
    if (!cart.items[req.params.id]) {
      return res.status(404).json({ error: 'Article introuvable.' });
    }
    cart.items[req.params.id].qty = Math.max(1, Number(qty));
    bucketInfo.bucket[bucketInfo.key] = cart;
    await saveCarts(carts);
    return res.json(cart);
  } catch (error) {
    console.error('Erreur mise à jour panier:', error);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

app.delete('/api/cart/items/:id', async (req, res) => {
  try {
    const { userId, anonId } = req.body;
    const carts = await loadCarts();
    const bucketInfo = resolveCartBucket(carts, { userId, anonId });
    if (!bucketInfo) {
      return res.status(400).json({ error: 'Identifiant manquant.' });
    }
    const cart = normalizeCart(bucketInfo.bucket[bucketInfo.key]);
    delete cart.items[req.params.id];
    bucketInfo.bucket[bucketInfo.key] = cart;
    await saveCarts(carts);
    return res.json(cart);
  } catch (error) {
    console.error('Erreur suppression panier:', error);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

app.delete('/api/cart', async (req, res) => {
  try {
    const { userId, anonId } = req.body;
    const carts = await loadCarts();
    const bucketInfo = resolveCartBucket(carts, { userId, anonId });
    if (!bucketInfo) {
      return res.status(400).json({ error: 'Identifiant manquant.' });
    }
    bucketInfo.bucket[bucketInfo.key] = normalizeCart();
    await saveCarts(carts);
    return res.json(bucketInfo.bucket[bucketInfo.key]);
  } catch (error) {
    console.error('Erreur vidage panier:', error);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

app.post('/api/cart/sync', async (req, res) => {
  try {
    const { anonId, userId } = req.body;
    if (!anonId || !userId) {
      return res.status(400).json({ error: 'Identifiant manquant.' });
    }
    const carts = await loadCarts();
    const anonCart = normalizeCart(carts.anonymous[anonId]);
    const userCart = normalizeCart(carts.users[userId]);
    Object.entries(anonCart.items).forEach(([id, item]) => {
      if (!userCart.items[id]) {
        userCart.items[id] = { ...item };
      } else {
        userCart.items[id].qty += item.qty;
      }
    });
    carts.users[userId] = userCart;
    delete carts.anonymous[anonId];
    await saveCarts(carts);
    return res.json(userCart);
  } catch (error) {
    console.error('Erreur sync panier:', error);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

function applyFilters(products, filters) {
  const {
    category,
    published,
    featured,
    minPrice,
    maxPrice,
    q
  } = filters;

  return products.filter((product) => {
    if (category && product.category !== category) return false;
    if (published !== undefined && product.published !== published) return false;
    if (featured !== undefined && product.featured !== featured) return false;
    if (minPrice !== undefined && product.price < minPrice) return false;
    if (maxPrice !== undefined && product.price > maxPrice) return false;
    if (q) {
      const haystack = `${product.title} ${product.shortDescription ?? ''} ${product.description ?? ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

app.get('/api/products', async (req, res) => {
  try {
    const products = await loadProducts();
    const { slug } = req.query;

    if (slug) {
      const match = products.find((product) => product.slug === slug);
      if (!match) {
        return res.status(404).json({ error: 'Produit introuvable.' });
      }
      return res.json(match);
    }

    const filters = {
      category: req.query.category,
      published: req.query.published ? req.query.published === 'true' : undefined,
      featured: req.query.featured ? req.query.featured === 'true' : undefined,
      minPrice: req.query.minPrice ? Number(req.query.minPrice) : undefined,
      maxPrice: req.query.maxPrice ? Number(req.query.maxPrice) : undefined,
      q: req.query.q ? String(req.query.q).toLowerCase() : ''
    };

    const filtered = applyFilters(products, filters);
    return res.json(filtered);
  } catch (error) {
    console.error('Erreur chargement produits:', error);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const products = await loadProducts();
    const match = products.find((product) => product.id === req.params.id);
    if (!match) {
      return res.status(404).json({ error: 'Produit introuvable.' });
    }
    return res.json(match);
  } catch (error) {
    console.error('Erreur chargement produit:', error);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

app.listen(PORT, () => {
  console.log(`InsideX server running on http://localhost:${PORT}`);
});
