import { initHeader } from './modules/header.js';
import { initAuth } from './modules/auth.js';
import { initCarousel } from './modules/carousel.js';
import { updateBadge } from './modules/cart.js';
import { initCartDrawer, wireAddToCartButtons } from './modules/cartDrawer.js';
import { initProductLinks } from './modules/productLinks.js';
import { renderCarousel } from './modules/renderCarousel.js';
import { renderProducts } from './modules/renderProducts.js';
import { renderTexts } from './modules/renderTexts.js';
import { initLeadCapture } from './modules/leadCapture.js';
import { initCatalogSearch } from './modules/catalogSearch.js';
import { initAnalytics } from './modules/analytics.js';

document.addEventListener('DOMContentLoaded', async () => {
  initAnalytics();
  initHeader();
  initAuth();
  await renderTexts();
  const slideCount = await renderCarousel();
  if (slideCount > 0) {
    initCarousel();     // IMPORTANT : c'est ici que ton carrousel démarre
  }
  initCartDrawer();
  await renderProducts();
  await initCatalogSearch();
  wireAddToCartButtons();
  initProductLinks();
  await updateBadge();
  initLeadCapture();

  document.addEventListener('products:updated', async () => {
    await renderProducts();
    wireAddToCartButtons();
    initProductLinks();
    await updateBadge();
  });
});