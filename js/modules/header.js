import { showToast } from './toast.js';

export function initHeader() {
  // Menu mobile
  const menuBtn = document.getElementById('menuBtn');
  const mobileNav = document.getElementById('mobileNav');
  if (menuBtn && mobileNav) {
    menuBtn.addEventListener('click', () => {
      mobileNav.classList.toggle('open');
      mobileNav.setAttribute('aria-hidden', mobileNav.classList.contains('open') ? 'false' : 'true');
    });
    mobileNav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        mobileNav.classList.remove('open');
        mobileNav.setAttribute('aria-hidden', 'true');
      });
    });
  }

  // Placeholders recherche / compte
  const searchBtn = document.getElementById('searchBtn');
  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      const searchInput = document.getElementById('catalogSearch');
      if (searchInput) {
        searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        searchInput.focus({ preventScroll: true });
      } else {
        showToast('🔎 La recherche arrive bientôt !', 'info');
      }
    });
  }
  const accountBtn = document.getElementById('accountBtn');
  if (accountBtn) {
    accountBtn.setAttribute('data-auth-open', 'true');
  }
}