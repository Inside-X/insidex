import { applyAdminUiGuards } from '../js/modules/adminUiAccess.js';

class FakeElement {
  constructor({ id = '', tag = 'div', dataset = {} } = {}) {
    this.id = id;
    this.tagName = tag.toUpperCase();
    this.dataset = { ...dataset };
    this.hidden = false;
    this.disabled = false;
    this.attributes = {};
    this.children = [];
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  remove() {
    this._removed = true;
  }

  querySelector(selector) {
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      return this.children.find((child) => child.id === id && !child._removed) || null;
    }
    return null;
  }
}

function createFakeRoot() {
  const nav = new FakeElement({ tag: 'nav' });
  const mobileNav = new FakeElement({ id: 'mobileNav' });
  const adminSection = new FakeElement({ id: 'admin', dataset: { adminOnly: 'true' } });

  const adminInput = new FakeElement({ id: 'adminTitle', tag: 'input' });
  const adminSave = new FakeElement({ id: 'adminSave', tag: 'button' });
  const adminReset = new FakeElement({ id: 'adminProductReset', tag: 'button' });
  adminSection.appendChild(adminInput);
  adminSection.appendChild(adminSave);
  adminSection.appendChild(adminReset);

  const byId = {
    mobileNav,
    admin: adminSection,
    adminTitle: adminInput,
    adminSave,
    adminProductReset: adminReset
  };

  return {
    byId,

    createElement(tag) {
      return new FakeElement({ tag });
    },
    querySelector(selector) {
      if (selector === '.nav') return nav;
      return null;
    },
    getElementById(id) {
      return byId[id] || null;
    },
    querySelectorAll(selector) {
      if (selector === '[data-admin-only]') {
        const section = [adminSection];
        const navLink = nav.querySelector('#adminNavLink');
        const mobileLink = mobileNav.querySelector('#adminMobileLink');
        if (navLink && navLink.dataset.adminOnly) section.push(navLink);
        if (mobileLink && mobileLink.dataset.adminOnly) section.push(mobileLink);
        return section.filter((el) => !el._removed);
      }

      if (selector === '[data-admin-only] input, [data-admin-only] select, [data-admin-only] textarea, [data-admin-only] button') {
        return adminSection.children.filter((child) => ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(child.tagName));
      }

      return [];
    }
  };
}

describe('E2E UI visibility - admin menu/actions by role', () => {
  beforeEach(() => {
    global.window = {
      location: {
        hash: '#admin',
        pathname: '/',
        search: ''
      }
    };
    global.history = {
      replaceState: (_, __, nextUrl) => {
        const [pathWithQuery, hash] = String(nextUrl).split('#');
        const [pathname, search = ''] = pathWithQuery.split('?');
        window.location.pathname = pathname || '/';
        window.location.search = search ? `?${search}` : '';
        window.location.hash = hash ? `#${hash}` : '';
      }
    };
  });

  test('non-authenticated user: no admin menu, no admin actions, admin route visually guarded', () => {
    const root = createFakeRoot();
    const isAdmin = applyAdminUiGuards({ loading: false, role: null }, root);

    expect(isAdmin).toBe(false);
    expect(root.getElementById('admin').hidden).toBe(true);
    expect(root.querySelector('.nav').querySelector('#adminNavLink')).toBeNull();
    expect(root.getElementById('mobileNav').querySelector('#adminMobileLink')).toBeNull();
    expect(root.getElementById('adminSave').disabled).toBe(true);
    expect(root.getElementById('adminProductReset').disabled).toBe(true);
    expect(window.location.hash).toBe('');
  });

  test('customer user: no admin menu, no admin actions, admin route visually guarded', () => {
    const root = createFakeRoot();
    const isAdmin = applyAdminUiGuards({ loading: false, role: 'customer' }, root);

    expect(isAdmin).toBe(false);
    expect(root.getElementById('admin').hidden).toBe(true);
    expect(root.querySelector('.nav').querySelector('#adminNavLink')).toBeNull();
    expect(root.getElementById('mobileNav').querySelector('#adminMobileLink')).toBeNull();
    expect(root.getElementById('adminSave').disabled).toBe(true);
    expect(root.getElementById('adminProductReset').disabled).toBe(true);
    expect(window.location.hash).toBe('');
  });

  test('admin user: admin menu and actions are visible/enabled', () => {
    const root = createFakeRoot();
    const isAdmin = applyAdminUiGuards({ loading: false, role: 'admin' }, root);

    expect(isAdmin).toBe(true);
    expect(root.getElementById('admin').hidden).toBe(false);

    const desktopLink = root.querySelector('.nav').querySelector('#adminNavLink');
    const mobileLink = root.getElementById('mobileNav').querySelector('#adminMobileLink');

    expect(desktopLink).not.toBeNull();
    expect(mobileLink).not.toBeNull();
    expect(desktopLink.href).toBe('#admin');
    expect(mobileLink.href).toBe('#admin');
    expect(root.getElementById('adminSave').disabled).toBe(false);
    expect(root.getElementById('adminProductReset').disabled).toBe(false);
    expect(window.location.hash).toBe('#admin');
  });

  test('loading state: fail-closed (admin remains hidden until role confirmed)', () => {
    const root = createFakeRoot();
    const isAdmin = applyAdminUiGuards({ loading: true, role: 'admin' }, root);

    expect(isAdmin).toBe(false);
    expect(root.getElementById('admin').hidden).toBe(true);
    expect(root.querySelector('.nav').querySelector('#adminNavLink')).toBeNull();
    expect(root.getElementById('mobileNav').querySelector('#adminMobileLink')).toBeNull();
  });
});