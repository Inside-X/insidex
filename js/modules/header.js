import { showToast } from './toast.js';
import { getUserId, setUserId, syncCartToUser, updateBadge } from './cart.js';

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
      const currentUser = getUserId();
      const promptLabel = currentUser
        ? `Connecté en tant que ${currentUser}. Changer d'email ?`
        : 'Entrez votre email pour synchroniser le panier :';
      const input = window.prompt(promptLabel);
      if (!input) {
        if (currentUser) {
          showToast(`👤 Connecté en tant que ${currentUser}.`, 'info');
        }
        return;
      }
      const userId = input.trim();
      if (!userId) {
        showToast('⚠️ Email invalide.', 'warning');
        return;
      }
      setUserId(userId);
      syncCartToUser(userId)
        .then(() => updateBadge())
        .then(() => {
          showToast(`✅ Panier synchronisé pour ${userId}.`, 'success');
        })
        .catch(() => {
          showToast('❌ Synchronisation impossible.', 'error');
        });
    });
  }
}
