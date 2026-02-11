import { initHeader } from './modules/header.js';
import { initAuth, getAuthState, onAuthStateChange } from './modules/auth.js';
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
import { initAdminProducts } from './modules/adminProducts.js';
import { initAdminLeads } from './modules/adminLeads.js';
import { initAdminAnalytics } from './modules/adminAnalytics.js';
import { applyAdminUiGuards } from './modules/adminUiAccess.js';

let adminInitialized = false;

async function initAdminFeaturesOnce() {
  if (adminInitialized) {
    return;
  }
  adminInitialized = true;
  initAdminProducts();
  await initAdminLeads();
  await initAdminAnalytics();
}

document.addEventListener('DOMContentLoaded', async () => {
  initAnalytics();
  initHeader();
  await initAuth();

  const authState = getAuthState();
  const isAdmin = applyAdminVisibility(authState);
  if (isAdmin) {
    await initAdminFeaturesOnce();
  }

  onAuthStateChange(async (nextState) => {
    const nextIsAdmin = applyAdminVisibility(nextState);
    if (nextIsAdmin) {
      await initAdminFeaturesOnce();
    }
  });

  await renderTexts();
  const slideCount = await renderCarousel();
  if (slideCount > 0) {
    initCarousel();
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