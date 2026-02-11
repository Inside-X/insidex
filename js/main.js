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

let adminInitialized = false;

function upsertAdminLink(container, id) {
  if (!container) {
    return;
  }

  let link = container.querySelector(`#${id}`);
  if (!link) {
    link = document.createElement('a');
    link.id = id;
    link.href = '#admin';
    link.textContent = 'Espace admin';
    container.appendChild(link);
  }
  link.hidden = false;
}

function removeAdminLink(container, id) {
  const link = container?.querySelector(`#${id}`);
  if (link) {
    link.remove();
  }
}

function applyAdminVisibility(authState) {
  const adminSection = document.getElementById('admin');
  const isConfirmedAdmin = !authState.loading && authState.role === 'admin';

  if (adminSection) {
    adminSection.hidden = !isConfirmedAdmin;
    adminSection.setAttribute('aria-hidden', String(!isConfirmedAdmin));
  }

  const nav = document.querySelector('.nav');
  const mobileNav = document.getElementById('mobileNav');

  if (isConfirmedAdmin) {
    upsertAdminLink(nav, 'adminNavLink');
    upsertAdminLink(mobileNav, 'adminMobileLink');
  } else {
    removeAdminLink(nav, 'adminNavLink');
    removeAdminLink(mobileNav, 'adminMobileLink');
  }

  return isConfirmedAdmin;
}

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