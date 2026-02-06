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
      showToast('🔎 La recherche arrive bientôt !', 'info');
    });
  }
  const accountBtn = document.getElementById('accountBtn');
  if (accountBtn) {
    accountBtn.addEventListener('click', () => {
      showToast('👤 Espace compte bientôt disponible !', 'info');
    });
  }
}
