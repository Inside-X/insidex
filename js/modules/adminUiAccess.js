function isConfirmedAdmin(authState) {
  return Boolean(authState && authState.loading === false && authState.role === 'admin');
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
  if (isAdmin) {
    return;
  }

  if (window.location.hash === '#admin') {
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  }
}

export function applyAdminUiGuards(authState, root = document) {
  const isAdmin = isConfirmedAdmin(authState);
  setAdminElementsVisibility(isAdmin, root);
  setAdminActionsAvailability(isAdmin, root);
  ensureAdminRouteGuard(isAdmin);
  return isAdmin;
}