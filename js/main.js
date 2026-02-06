import { initHeader } from './modules/header.js';
import { initCarousel } from './modules/carousel.js';
import { updateBadge } from './modules/cart.js';
import { initCartDrawer, wireAddToCartButtons } from './modules/cartDrawer.js';

document.addEventListener('DOMContentLoaded', () => {
  initHeader();
  initCarousel();     // IMPORTANT : c'est ici que ton carrousel démarre
  initCartDrawer();
  wireAddToCartButtons();
  updateBadge();
});