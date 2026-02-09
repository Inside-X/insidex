import { getAllProducts, saveProducts } from './productService.js';

const currencyFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR'
});

function slugify(value) {
  return value
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseNumber(value, fallback = 0) {
  if (value === '' || value === null || value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseImages(value) {
  return value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeText(value) {
  return value?.trim() ?? '';
}

function formatTimestamp() {
  return new Date().toISOString();
}

function updateFormStatus(statusEl, message, tone = '') {
  if (!statusEl) {
    return;
  }
  statusEl.textContent = message;
  statusEl.dataset.tone = tone;
}

function mapProductToForm(form, product) {
  form.elements.id.value = product?.id ?? '';
  form.elements.title.value = product?.title ?? '';
  form.elements.slug.value = product?.slug ?? '';
  form.elements.price.value = product?.price ?? '';
  form.elements.oldPrice.value = product?.oldPrice ?? '';
  form.elements.category.value = product?.category ?? '';
  form.elements.images.value = Array.isArray(product?.images) ? product.images.join(', ') : '';
  form.elements.benefit.value = product?.benefit ?? '';
  form.elements.shortDescription.value = product?.shortDescription ?? '';
  form.elements.description.value = product?.description ?? '';
  form.elements.dimensions.value = product?.dimensions ?? '';
  form.elements.generalFeatures.value = product?.generalFeatures ?? '';
  form.elements.materials.value = product?.materials ?? '';
  form.elements.comfort.value = product?.comfort ?? '';
  form.elements.advantages.value = product?.advantages ?? '';
  form.elements.packaging.value = product?.packaging ?? '';
  form.elements.stock.value = product?.stock ?? '';
  form.elements.order.value = product?.order ?? '';
  form.elements.featured.checked = Boolean(product?.featured);
  form.elements.published.checked = Boolean(product?.published);
}

function buildProductRow(product, onEdit, onDelete, onTogglePublish) {
  const item = document.createElement('article');
  item.className = 'admin-product-item';

  const info = document.createElement('div');
  info.className = 'admin-product-info';

  const title = document.createElement('h4');
  title.textContent = product.title;

  const meta = document.createElement('p');
  meta.className = 'admin-product-meta';
  const price = currencyFormatter.format(product.price ?? 0);
  meta.textContent = `${price} • ${product.category ?? 'Sans catégorie'} • ${
    product.published ? 'Publié' : 'Brouillon'
  }`;

  info.append(title, meta);

  const actions = document.createElement('div');
  actions.className = 'admin-product-actions';

  const publishLabel = document.createElement('label');
  publishLabel.className = 'admin-toggle';
  const publishCheckbox = document.createElement('input');
  publishCheckbox.type = 'checkbox';
  publishCheckbox.checked = Boolean(product.published);
  publishCheckbox.addEventListener('change', () => onTogglePublish(product.id, publishCheckbox.checked));
  const publishText = document.createElement('span');
  publishText.textContent = 'Publié';
  publishLabel.append(publishCheckbox, publishText);

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'btn btn-outline';
  editBtn.textContent = 'Modifier';
  editBtn.addEventListener('click', () => onEdit(product.id));

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'btn btn-link danger';
  deleteBtn.textContent = 'Supprimer';
  deleteBtn.addEventListener('click', () => onDelete(product.id));

  actions.append(publishLabel, editBtn, deleteBtn);
  item.append(info, actions);
  return item;
}

function broadcastProductsUpdate() {
  document.dispatchEvent(new CustomEvent('products:updated'));
}

export async function initAdminProducts() {
  const form = document.getElementById('adminProductForm');
  const list = document.getElementById('adminProductList');
  const status = document.getElementById('adminProductStatus');
  const resetBtn = document.getElementById('adminProductReset');

  if (!form || !list) {
    return;
  }

  let products = await getAllProducts();
  let editingId = null;

  const resetForm = () => {
    editingId = null;
    form.reset();
    form.elements.id.value = '';
    updateFormStatus(status, 'Prêt pour un nouveau produit.', '');
  };

  const persistProducts = (nextProducts) => {
    products = nextProducts;
    saveProducts(products);
    renderList();
    broadcastProductsUpdate();
  };

  const handleEdit = (id) => {
    const product = products.find((entry) => entry.id === id);
    if (!product) {
      return;
    }
    editingId = id;
    mapProductToForm(form, product);
    updateFormStatus(status, `Modification de ${product.title}`, 'info');
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleDelete = (id) => {
    const product = products.find((entry) => entry.id === id);
    if (!product) {
      return;
    }
    const confirmed = window.confirm(`Supprimer "${product.title}" ?`);
    if (!confirmed) {
      return;
    }
    const nextProducts = products.filter((entry) => entry.id !== id);
    persistProducts(nextProducts);
    resetForm();
    updateFormStatus(status, 'Produit supprimé.', 'warning');
  };

  const handleTogglePublish = (id, published) => {
    const nextProducts = products.map((entry) =>
      entry.id === id
        ? { ...entry, published, updatedAt: formatTimestamp() }
        : entry
    );
    persistProducts(nextProducts);
    updateFormStatus(
      status,
      published ? 'Produit publié.' : 'Produit dépublié.',
      'success'
    );
  };

  const renderList = () => {
    list.innerHTML = '';
    const fragment = document.createDocumentFragment();
    products.forEach((product) => {
      fragment.appendChild(
        buildProductRow(product, handleEdit, handleDelete, handleTogglePublish)
      );
    });
    list.appendChild(fragment);
    if (!products.length) {
      const empty = document.createElement('p');
      empty.className = 'admin-empty';
      empty.textContent = 'Aucun produit disponible. Ajoutez-en un.';
      list.appendChild(empty);
    }
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const title = normalizeText(formData.get('title'));
    if (!title) {
      updateFormStatus(status, 'La désignation est obligatoire.', 'warning');
      return;
    }

    const slugInput = normalizeText(formData.get('slug'));
    const slug = slugInput || slugify(title);
    const images = parseImages(normalizeText(formData.get('images')));

    const payload = {
      id: editingId || `product-${slug}-${Date.now()}`,
      title,
      designation: title,
      slug,
      price: parseNumber(formData.get('price')),
      oldPrice: parseNumber(formData.get('oldPrice'), null),
      category: normalizeText(formData.get('category')),
      images,
      benefit: normalizeText(formData.get('benefit')),
      shortDescription: normalizeText(formData.get('shortDescription')),
      description: normalizeText(formData.get('description')),
      dimensions: normalizeText(formData.get('dimensions')),
      generalFeatures: normalizeText(formData.get('generalFeatures')),
      materials: normalizeText(formData.get('materials')),
      comfort: normalizeText(formData.get('comfort')),
      advantages: normalizeText(formData.get('advantages')),
      packaging: normalizeText(formData.get('packaging')),
      stock: parseNumber(formData.get('stock'), 0),
      order: parseNumber(formData.get('order'), 0),
      featured: form.elements.featured.checked,
      published: form.elements.published.checked,
      updatedAt: formatTimestamp()
    };

    let nextProducts = [];
    if (editingId) {
      nextProducts = products.map((entry) =>
        entry.id === editingId ? { ...entry, ...payload } : entry
      );
      updateFormStatus(status, 'Produit mis à jour.', 'success');
    } else {
      payload.createdAt = formatTimestamp();
      nextProducts = [payload, ...products];
      updateFormStatus(status, 'Nouveau produit ajouté.', 'success');
    }

    persistProducts(nextProducts);
    resetForm();
  });

  if (resetBtn) {
    resetBtn.addEventListener('click', resetForm);
  }

  renderList();
  updateFormStatus(status, 'Catalogue chargé.', 'info');
}