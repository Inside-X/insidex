import { getPublishedProducts } from './productService.js';
import { renderProducts } from './renderProducts.js';
import { toMinorUnitsDecimalString } from './money.js';

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
  product.material,
  product.color,
  product.shortDescription,
  product.benefit,
  product.description
].filter(Boolean).join(' '));

const PRICE_FILTERS = {
  'lt-700': { min: 0, max: 699 },
  '700-1200': { min: 700, max: 1200 },
  '1200-1600': { min: 1200, max: 1600 },
  'gt-1600': { min: 1601, max: Number.POSITIVE_INFINITY }
};

const buildOptions = (values, fallbackLabel) => {
  const sorted = [...new Set(values.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'fr', { sensitivity: 'base' })
  );
  if (sorted.length === 0) {
    return [{ value: 'all', label: fallbackLabel }];
  }
  return [
    { value: 'all', label: fallbackLabel },
    ...sorted.map((value) => ({
      value: normalizeText(value),
      label: value
    }))
  ];
};

const applySelectOptions = (select, options) => {
  if (!select) {
    return;
  }
  const currentValue = select.value;
  select.innerHTML = '';
  options.forEach((option) => {
    const entry = document.createElement('option');
    entry.value = option.value;
    entry.textContent = option.label;
    select.appendChild(entry);
  });
  if ([...select.options].some((option) => option.value === currentValue)) {
    select.value = currentValue;
  }
};

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
  const categoryFilter = document.getElementById('filterCategory');
  const priceFilter = document.getElementById('filterPrice');
  const materialFilter = document.getElementById('filterMaterial');
  const colorFilter = document.getElementById('filterColor');
  const filterReset = document.getElementById('filterReset');

  const products = await getPublishedProducts();
  const searchIndex = products.map((product) => ({
    product,
    haystack: buildHaystack(product)
  }));

  applySelectOptions(
    categoryFilter,
    buildOptions(
      products.map((product) => product.category),
      'Toutes les catégories'
    )
  );
  applySelectOptions(
    materialFilter,
    buildOptions(
      products.map((product) => product.material),
      'Toutes matières'
    )
  );
  applySelectOptions(
    colorFilter,
    buildOptions(
      products.map((product) => product.color),
      'Toutes les couleurs'
    )
  );

  const filters = {
    category: categoryFilter?.value ?? 'all',
    price: priceFilter?.value ?? 'all',
    material: materialFilter?.value ?? 'all',
    color: colorFilter?.value ?? 'all'
  };

  const hasActiveFilters = () => Object.values(filters).some((value) => value !== 'all');
  
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

    if (!normalizedQuery && !hasActiveFilters()) {
      await renderProducts();
      setStatus('Affichage des produits populaires.');
      if (suggestionsEl) {
        suggestionsEl.hidden = true;
      }
      return;
    }

    const matches = searchIndex
      .filter(({ haystack, product }) => {
        if (normalizedQuery && !haystack.includes(normalizedQuery)) {
          return false;
        }
        if (filters.category !== 'all' && normalizeText(product.category) !== filters.category) {
          return false;
        }
        if (filters.material !== 'all' && normalizeText(product.material) !== filters.material) {
          return false;
        }
        if (filters.color !== 'all' && normalizeText(product.color) !== filters.color) {
          return false;
        }
        if (filters.price !== 'all') {
          const range = PRICE_FILTERS[filters.price];
          if (!range) {
            return true;
          }
          const priceMinor = toMinorUnitsDecimalString(String(product.price), 'EUR');
          const minMinor = toMinorUnitsDecimalString(String(range.min), 'EUR');
          const maxMinor = range.max === Number.POSITIVE_INFINITY
            ? null
            : toMinorUnitsDecimalString(String(range.max), 'EUR');
          if (priceMinor < minMinor || (maxMinor !== null && priceMinor > maxMinor)) {
            return false;
          }
        }
        return true;
      })
      .map(({ product }) => product);

    await renderProducts({ products: matches, showFeaturedOnly: false });
    if (matches.length === 0) {
      if (normalizedQuery) {
        setStatus(`Aucun produit ne correspond à “${trimmed}”.`);
      } else {
        setStatus('Aucun produit ne correspond à ces filtres.');
      }
    } else {
      if (normalizedQuery) {
        setStatus(`${matches.length} produit${matches.length > 1 ? 's' : ''} trouvé${matches.length > 1 ? 's' : ''} pour “${trimmed}”.`);
      } else {
        setStatus(`${matches.length} produit${matches.length > 1 ? 's' : ''} affiché${matches.length > 1 ? 's' : ''} selon vos filtres.`);
      }
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

  const handleFilterChange = () => {
    if (categoryFilter) {
      filters.category = categoryFilter.value;
    }
    if (priceFilter) {
      filters.price = priceFilter.value;
    }
    if (materialFilter) {
      filters.material = materialFilter.value;
    }
    if (colorFilter) {
      filters.color = colorFilter.value;
    }
    applySearch(input.value);
  };

  [categoryFilter, priceFilter, materialFilter, colorFilter].forEach((select) => {
    if (!select) {
      return;
    }
    select.addEventListener('change', handleFilterChange);
  });

  if (filterReset) {
    filterReset.addEventListener('click', () => {
      if (categoryFilter) {
        categoryFilter.value = 'all';
      }
      if (priceFilter) {
        priceFilter.value = 'all';
      }
      if (materialFilter) {
        materialFilter.value = 'all';
      }
      if (colorFilter) {
        colorFilter.value = 'all';
      }
      handleFilterChange();
    });
  }
  
  setStatus('Affichage des produits populaires.');
}