import { showToast } from './toast.js';
import { clearUserId, setUserId, syncCartToUser, updateBadge } from './cart.js';

const USER_KEY = 'insidex_auth_user';

const state = {
  user: null,
  loading: true,
  error: null
};

function normalizeRole(role) {
  return typeof role === 'string' ? role.trim().toLowerCase() : null;
}

function sanitizeUser(user) {
  if (!user || typeof user !== 'object') {
    return null;
  }
  return {
    id: user.id ?? null,
    email: user.email ?? null,
    name: user.name ?? null,
    role: normalizeRole(user.role)
  };
}

function emitAuthState() {
  document.dispatchEvent(new CustomEvent('auth:state-changed', {
    detail: getAuthState()
  }));
}

function applyAuthPayload(payload) {
  const user = sanitizeUser(payload?.user || payload);
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    state.user = user;
  }
  emitAuthState();
}

function clearStoredSession() {
  localStorage.removeItem(USER_KEY);
  state.user = null;
  state.error = null;
  emitAuthState();
}

function loadStoredSession() {
  const userRaw = localStorage.getItem(USER_KEY);

  state.user = null;

  if (userRaw) {
    try {
      state.user = sanitizeUser(JSON.parse(userRaw));
    } catch (error) {
      localStorage.removeItem(USER_KEY);
    }
  }
}

async function authRequest(url, payload = {}) {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Erreur authentification.');
  }
  return data;
}

async function fetchProfile() {
  const response = await fetch('/api/auth/me', {
    method: 'GET',
    credentials: 'include'
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || 'Impossible de charger le profil.');
    error.status = response.status;
    throw error;
  }

  return sanitizeUser(data.user);
}

function updateAccountButton(accountBtn) {
  if (!accountBtn) return;
  if (state.user) {
    accountBtn.classList.add('is-authenticated');
    accountBtn.setAttribute('title', `Connecté : ${state.user.email}`);
    accountBtn.setAttribute('aria-label', `Connecté : ${state.user.email}`);
  } else {
    accountBtn.classList.remove('is-authenticated');
    accountBtn.setAttribute('title', 'Mon compte');
    accountBtn.setAttribute('aria-label', 'Mon compte');
  }
}

function updateProfilePanel(modal) {
  if (!modal) return;
  const nameEl = modal.querySelector('[data-auth-profile-name]');
  const emailEl = modal.querySelector('[data-auth-profile-email]');
  if (state.user) {
    if (nameEl) nameEl.textContent = state.user.name || state.user.email;
    if (emailEl) emailEl.textContent = state.user.email;
  } else {
    if (nameEl) nameEl.textContent = 'Invité';
    if (emailEl) emailEl.textContent = '—';
  }
}

function showPanel(panelId, modal) {
  modal.querySelectorAll('[data-auth-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.authPanel !== panelId;
  });
  modal.querySelectorAll('[data-auth-tab]').forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.authTab === panelId);
  });
}

function setStatus(modal, message, tone = 'info') {
  const status = modal.querySelector('[data-auth-status]');
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}

async function resolveAuthenticatedUser() {
  try {
    return await fetchProfile();
  } catch (error) {
    if (error.status !== 401 && error.status !== 403) {
      throw error;
    }
  }

  try {
    await authRequest('/api/auth/refresh', {});
    return await fetchProfile();
  } catch (_error) {
    return null;
  }
}

async function refreshSession(modal) {
  state.loading = true;
  state.error = null;
  emitAuthState();

  try {
    const profile = await resolveAuthenticatedUser();

    if (!profile) {
      clearStoredSession();
      clearUserId();
      updateAccountButton(document.getElementById('accountBtn'));
      if (modal) {
        setStatus(modal, 'Connectez-vous pour synchroniser votre panier.', 'info');
        updateProfilePanel(modal);
        showPanel('login', modal);
      }
      return;
    }

    state.user = profile;
    localStorage.setItem(USER_KEY, JSON.stringify(profile));
    setUserId(profile.email);
    updateAccountButton(document.getElementById('accountBtn'));
    if (modal) {
      setStatus(modal, `Connecté en tant que ${profile.email}.`, 'info');
      updateProfilePanel(modal);
      showPanel('profile', modal);
    }
  } catch (error) {
    state.error = error.message;
    clearStoredSession();
    clearUserId();
    updateAccountButton(document.getElementById('accountBtn'));
  } finally {
    state.loading = false;
    emitAuthState();
  }
}

async function handleLogin(form, modal) {
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  const data = await authRequest('/api/auth/login', payload);
  applyAuthPayload(data.data);
  await refreshSession(modal);
  if (!state.user) {
    throw new Error('Session invalide après connexion.');
  }
  setUserId(state.user.email);
  await syncCartToUser(state.user.email);
  await updateBadge();
  setStatus(modal, `Bienvenue ${state.user.name || state.user.email} !`, 'success');
  showToast('✅ Connexion réussie.', 'success');
  updateAccountButton(document.getElementById('accountBtn'));
  updateProfilePanel(modal);
  showPanel('profile', modal);
}

async function handleRegister(form, modal) {
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  const data = await authRequest('/api/auth/register', payload);
  applyAuthPayload(data.data);
  await refreshSession(modal);
  if (!state.user) {
    throw new Error('Session invalide après inscription.');
  }
  setUserId(state.user.email);
  await syncCartToUser(state.user.email);
  await updateBadge();
  setStatus(modal, `Compte créé pour ${state.user.email}.`, 'success');
  showToast('✅ Inscription terminée.', 'success');
  updateAccountButton(document.getElementById('accountBtn'));
  updateProfilePanel(modal);
  showPanel('profile', modal);
}

async function handleForgot(form, modal) {
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  const data = await authRequest('/api/auth/forgot', payload);
  const output = modal.querySelector('[data-auth-reset-token]');
  if (output) {
    output.textContent = data.resetToken;
  }
  setStatus(modal, 'Token de réinitialisation généré.', 'success');
  showPanel('reset', modal);
}

async function handleReset(form, modal) {
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  await authRequest('/api/auth/reset', payload);
  setStatus(modal, 'Mot de passe mis à jour. Vous pouvez vous reconnecter.', 'success');
  showPanel('login', modal);
}

async function handleLogout(modal) {
  try {
    await authRequest('/api/auth/logout', {});
  } catch (error) {
    console.error(error);
  }
  clearStoredSession();
  clearUserId();
  await updateBadge();
  setStatus(modal, 'Déconnexion effectuée.', 'info');
  showToast('👋 Déconnecté.', 'info');
  updateAccountButton(document.getElementById('accountBtn'));
  updateProfilePanel(modal);
  showPanel('login', modal);
}

function bindModal(modal) {
  const openTriggers = document.querySelectorAll('[data-auth-open]');
  const closeBtn = modal.querySelector('[data-auth-close]');
  const backdrop = modal.querySelector('.auth-modal__backdrop');

  openTriggers.forEach((trigger) => {
    trigger.addEventListener('click', () => {
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      const activePanel = state.user ? 'profile' : 'login';
      showPanel(activePanel, modal);
      setStatus(
        modal,
        state.user ? `Connecté en tant que ${state.user.email}.` : 'Connectez-vous pour synchroniser votre panier.',
        'info'
      );
      updateProfilePanel(modal);
    });
  });

  const closeModal = () => {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  };

  [closeBtn, backdrop].forEach((el) => {
    if (el) {
      el.addEventListener('click', closeModal);
    }
  });

  modal.querySelectorAll('[data-auth-tab]').forEach((tab) => {
    tab.addEventListener('click', () => showPanel(tab.dataset.authTab, modal));
  });

  const loginForm = modal.querySelector('[data-auth-form="login"]');
  const registerForm = modal.querySelector('[data-auth-form="register"]');
  const forgotForm = modal.querySelector('[data-auth-form="forgot"]');
  const resetForm = modal.querySelector('[data-auth-form="reset"]');
  const logoutBtn = modal.querySelector('[data-auth-logout]');

  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      setStatus(modal, 'Connexion en cours...', 'info');
      try {
        await handleLogin(loginForm, modal);
      } catch (error) {
        setStatus(modal, error.message, 'error');
        showToast(error.message, 'error');
      }
    });
  }

  if (registerForm) {
    registerForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      setStatus(modal, 'Création du compte...', 'info');
      try {
        await handleRegister(registerForm, modal);
      } catch (error) {
        setStatus(modal, error.message, 'error');
        showToast(error.message, 'error');
      }
    });
  }

  if (forgotForm) {
    forgotForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      setStatus(modal, 'Génération du token...', 'info');
      try {
        await handleForgot(forgotForm, modal);
      } catch (error) {
        setStatus(modal, error.message, 'error');
        showToast(error.message, 'error');
      }
    });
  }

  if (resetForm) {
    resetForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      setStatus(modal, 'Mise à jour du mot de passe...', 'info');
      try {
        await handleReset(resetForm, modal);
      } catch (error) {
        setStatus(modal, error.message, 'error');
        showToast(error.message, 'error');
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await handleLogout(modal);
    });
  }

  const forgotLink = modal.querySelector('[data-auth-forgot-link]');
  if (forgotLink) {
    forgotLink.addEventListener('click', (event) => {
      event.preventDefault();
      showPanel('forgot', modal);
    });
  }
}

export function getAuthState() {
  return {
    user: state.user,
    role: state.user?.role ?? null,
    isAuthenticated: Boolean(state.user),
    loading: state.loading,
    error: state.error
  };
}

export function onAuthStateChange(callback) {
  const handler = (event) => callback(event.detail);
  document.addEventListener('auth:state-changed', handler);
  return () => document.removeEventListener('auth:state-changed', handler);
}

export async function initAuth() {
  const modal = document.getElementById('authModal');
  loadStoredSession();
  updateAccountButton(document.getElementById('accountBtn'));

  if (modal) {
    updateProfilePanel(modal);
    bindModal(modal);
  }

  await refreshSession(modal);
}