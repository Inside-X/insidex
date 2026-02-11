function isConfirmedAdmin(authState) {
  return Boolean(authState && authState.loading === false && authState.role === 'admin');
}

function upsertAdminLink(container, id, root = document) {
  if (!container) {
    return;
  }

  let link = container.querySelector(`#${id}`);
  if (!link) {
    link = root.createElement ? root.createElement('a') : document.createElement('a');
    link.id = id;
    link.href = '#admin';
    link.textContent = 'Espace admin';
    link.dataset.adminOnly = 'true';
    container.appendChild(link);
  }

  link.hidden = false;
  link.setAttribute('aria-hidden', 'false');
}

function removeAdminLink(container, id) {
  const link = container?.querySelector(`#${id}`);
  if (link) {
    link.remove();
  }
}

function syncAdminMenuLinks(isAdmin, root = document) {
  const nav = root.querySelector('.nav');
  const mobileNav = root.getElementById('mobileNav');

  if (isAdmin) {
    upsertAdminLink(nav, 'adminNavLink', root);
    upsertAdminLink(mobileNav, 'adminMobileLink', root);
  } else {
    removeAdminLink(nav, 'adminNavLink');
    removeAdminLink(mobileNav, 'adminMobileLink');
  }
}

function setAdminElementsVisibility(isAdmin, root = document) {
  root.querySelectorAll('[data-admin-only]').forEach((element) => {
    element.hidden = !isAdmin;
    element.setAttribute('aria-hidden', String(!isAdmin));
  });
}

function setAdminActionsAvailability(isAdmin, root = document) {
  root.querySelectorAll('[data-admin-only] input, [data-admin-only] select, [data-admin-only] textarea, [data-admin-only] button').forEach((control) => {
    control.disabled = !isAdmin;
  });
}

function ensureAdminRouteGuard(isAdmin) {
  if (isAdmin || typeof window === 'undefined' || typeof history === 'undefined') {
    return;
  }

  if (window.location.hash === '#admin') {
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  }
}

export function applyAdminUiGuards(authState, root = document) {
  const isAdmin = isConfirmedAdmin(authState);
  syncAdminMenuLinks(isAdmin, root);
  setAdminElementsVisibility(isAdmin, root);
  setAdminActionsAvailability(isAdmin, root);
  ensureAdminRouteGuard(isAdmin);
  return isAdmin;
}