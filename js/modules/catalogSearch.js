import { getPublishedProducts } from './productService.js';
import { renderProducts } from './renderProducts.js';

const normalizeText = (value) => value
  ?.toString()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim() ?? '';

const buildHaystack = (product) => normalizeText([
  product.title,
  product.designation,
  product.category,
  product.shortDescription,
  product.benefit,
  product.description
].filter(Boolean).join(' '));

function buildSuggestionButton(product) {
  const button = document.createElement('button');
  button.type = 'button';
  button.role = 'option';
  button.dataset.productId = product.id;
  button.textContent = product.title;

  const meta = document.createElement('span');
  meta.textContent = product.shortDescription || product.category || 'Produit Inside X';
  button.appendChild(meta);
  return button;
}

export async function initCatalogSearch() {
  const input = document.getElementById('catalogSearch');
  if (!input) {
    return;
  }

  const suggestionsEl = document.getElementById('catalogSuggestions');
  const statusEl = document.getElementById('catalogStatus');
  const clearBtn = document.getElementById('catalogClear');

  const products = await getPublishedProducts();
  const searchIndex = products.map((product) => ({
    product,
    haystack: buildHaystack(product)
  }));

  const setStatus = (message = '') => {
    if (statusEl) {
      statusEl.textContent = message;
    }
  };

  const updateSuggestions = (query) => {
    if (!suggestionsEl) {
      return;
    }
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) {
      suggestionsEl.hidden = true;
      suggestionsEl.innerHTML = '';
      return;
    }

    const matches = searchIndex
      .filter(({ haystack }) => haystack.includes(normalizedQuery))
      .slice(0, 5)
      .map(({ product }) => product);

    suggestionsEl.innerHTML = '';

    if (matches.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'search-status';
      empty.textContent = 'Aucune suggestion rapide.';
      suggestionsEl.appendChild(empty);
    } else {
      matches.forEach((product) => {
        suggestionsEl.appendChild(buildSuggestionButton(product));
      });
    }

    suggestionsEl.hidden = false;
  };

  const applySearch = async (query) => {
    const trimmed = query.trim();
    const normalizedQuery = normalizeText(trimmed);
    clearBtn.hidden = trimmed.length === 0;

    if (!normalizedQuery) {
      await renderProducts();
      setStatus('Affichage des produits populaires.');
      if (suggestionsEl) {
        suggestionsEl.hidden = true;
      }
      return;
    }

    const matches = searchIndex
      .filter(({ haystack }) => haystack.includes(normalizedQuery))
      .map(({ product }) => product);

    await renderProducts({ products: matches, showFeaturedOnly: false });
    if (matches.length === 0) {
      setStatus(`Aucun produit ne correspond à “${trimmed}”.`);
    } else {
      setStatus(`${matches.length} produit${matches.length > 1 ? 's' : ''} trouvé${matches.length > 1 ? 's' : ''} pour “${trimmed}”.`);
    }
  };

  let debounceId = null;
  input.addEventListener('input', () => {
    clearTimeout(debounceId);
    const value = input.value;
    debounceId = window.setTimeout(() => {
      updateSuggestions(value);
      applySearch(value);
    }, 150);
  });

  input.addEventListener('focus', () => {
    updateSuggestions(input.value);
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      input.value = '';
      updateSuggestions('');
      applySearch('');
    }
  });

  if (suggestionsEl) {
    suggestionsEl.addEventListener('mousedown', (event) => {
      const button = event.target.closest('button');
      if (!button) {
        return;
      }
      event.preventDefault();
      input.value = button.firstChild?.textContent ?? '';
      updateSuggestions(input.value);
      applySearch(input.value);
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      input.value = '';
      updateSuggestions('');
      applySearch('');
      input.focus();
    });
  }

  setStatus('Affichage des produits populaires.');
}