function getProductTarget(card) {
  const { slug, id } = card.dataset;
  if (slug) {
    return `product.html?slug=${encodeURIComponent(slug)}`;
  }
  if (id) {
    return `product.html?id=${encodeURIComponent(id)}`;
  }
  return null;
}

export function initProductLinks() {
  document.querySelectorAll('.product-card[data-id]').forEach((card) => {
    card.setAttribute('tabindex', '0');
    card.addEventListener('click', (event) => {
      if (event.target.closest('button') || event.target.closest('a')) {
        return;
      }
      const target = getProductTarget(card);
      if (!target) return;
      window.location.href = target;
    });
    card.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      const target = getProductTarget(card);
      if (!target) return;
      window.location.href = target;
    });
  });
}
