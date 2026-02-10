function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function renderCard(container, label, value) {
  const card = document.createElement('article');
  card.className = 'admin-metric-card';
  card.innerHTML = `
    <p class="admin-metric-label">${label}</p>
    <strong class="admin-metric-value">${value}</strong>
  `;
  container.appendChild(card);
}

async function fetchConversion() {
  const response = await fetch('/api/analytics/conversion');
  if (!response.ok) {
    throw new Error('Impossible de charger les conversions.');
  }
  return response.json();
}

export async function initAdminAnalytics() {
  const container = document.getElementById('adminConversionDashboard');
  const status = document.getElementById('adminConversionStatus');
  if (!container || !status) {
    return;
  }

  try {
    status.textContent = 'Chargement des conversions...';
    const summary = await fetchConversion();
    container.innerHTML = '';

    renderCard(container, 'Add to cart', summary.addToCart ?? 0);
    renderCard(container, 'Checkout initié', summary.beginCheckout ?? 0);
    renderCard(container, 'Achats', summary.purchase ?? 0);
    renderCard(container, 'Taux add→checkout', formatPercent(summary.checkoutRate ?? 0));
    renderCard(container, 'Taux checkout→achat', formatPercent(summary.purchaseRate ?? 0));

    status.textContent = 'Dashboard conversion alimenté.';
  } catch (error) {
    status.textContent = error.message || 'Erreur de chargement conversion.';
    status.dataset.tone = 'warning';
  }
}