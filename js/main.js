import { initHeader } from './modules/header.js';
import { initCarousel } from './modules/carousel.js';
import { updateBadge } from './modules/cart.js';
import { initCartDrawer, wireAddToCartButtons } from './modules/cartDrawer.js';
import { initProductLinks } from './modules/productLinks.js';
import { renderCarousel } from './modules/renderCarousel.js';

document.addEventListener('DOMContentLoaded', async () => {
  initHeader();
  const slideCount = await renderCarousel();
  if (slideCount > 0) {
    initCarousel();     // IMPORTANT : c'est ici que ton carrousel démarre
  }
  initCartDrawer();
  wireAddToCartButtons();
  initProductLinks();
  updateBadge();
});