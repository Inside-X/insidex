import { initHeader } from './modules/header.js';
import { initCarousel } from './modules/carousel.js';
import { updateBadge } from './modules/cart.js';
import { initCartDrawer, wireAddToCartButtons } from './modules/cartDrawer.js';
import { initProductLinks } from './modules/productLinks.js';
import { renderCarousel } from './modules/renderCarousel.js';
import { renderProducts } from './modules/renderProducts.js';
import { renderTexts } from './modules/renderTexts.js';
import { initRoleSimulation } from './modules/role.js';
import { initLeadCapture } from './modules/leadCapture.js';

document.addEventListener('DOMContentLoaded', async () => {
  initRoleSimulation();
  initHeader();
  await renderTexts();
  const slideCount = await renderCarousel();
  if (slideCount > 0) {
    initCarousel();     // IMPORTANT : c'est ici que ton carrousel démarre
  }
  initCartDrawer();
  await renderProducts();
  wireAddToCartButtons();
  initProductLinks();
  updateBadge();
  initLeadCapture();
});