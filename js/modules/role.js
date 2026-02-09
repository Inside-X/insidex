const isAdmin = true;

const ROLE_ADMIN = 'admin';
const ROLE_PUBLIC = 'public';

function getCurrentRole() {
  // TODO: Remplacer par une vraie authentification (token, session, API).
  return isAdmin ? ROLE_ADMIN : ROLE_PUBLIC;
}

function applyRoleVisibility(root = document) {
  const role = getCurrentRole();
  root.querySelectorAll('[data-role]').forEach((element) => {
    const allowedRoles = element.dataset.role
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const isAllowed = allowedRoles.length === 0 || allowedRoles.includes(role);
    element.hidden = !isAllowed;
    element.setAttribute('aria-hidden', (!isAllowed).toString());
  });
}

function injectAdminNav() {
  const role = getCurrentRole();
  if (role !== ROLE_ADMIN) {
    return;
  }

  const nav = document.querySelector('.nav');
  const mobileNav = document.getElementById('mobileNav');

  const linkConfigs = [
    { container: nav, id: 'adminNavLink' },
    { container: mobileNav, id: 'adminMobileLink' }
  ];

  linkConfigs.forEach(({ container, id }) => {
    if (!container || container.querySelector(`#${id}`)) {
      return;
    }
    const adminLink = document.createElement('a');
    adminLink.id = id;
    adminLink.href = '#admin';
    adminLink.dataset.role = ROLE_ADMIN;
    adminLink.textContent = 'Espace admin';
    container.appendChild(adminLink);
  });
}

export function initRoleSimulation() {
  const role = getCurrentRole();
  document.documentElement.dataset.role = role;
  applyRoleVisibility();
  injectAdminNav();
}