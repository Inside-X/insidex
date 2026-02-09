import express from 'express';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

async function loadProducts() {
  const filePath = path.join(__dirname, 'data', 'products.json');
  const content = await readFile(filePath, 'utf-8');
  const products = JSON.parse(content);
  return Array.isArray(products) ? products : [];
}

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
