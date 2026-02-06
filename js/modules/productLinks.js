export function initProductLinks() {
  document.querySelectorAll('.product-card[data-id]').forEach((card) => {
    card.setAttribute('tabindex', '0');
    card.addEventListener('click', (event) => {
      if (event.target.closest('button') || event.target.closest('a')) {
        return;
      }
      const { id } = card.dataset;
      if (!id) return;
      window.location.href = `product.html?id=${encodeURIComponent(id)}`;
    });
    card.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      const { id } = card.dataset;
      if (!id) return;
      window.location.href = `product.html?id=${encodeURIComponent(id)}`;
    });
  });
}
