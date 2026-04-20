import { jest } from '@jest/globals';

const clearUserId = jest.fn();
const setUserId = jest.fn();
const syncCartToUser = jest.fn();
const updateBadge = jest.fn();
const showToast = jest.fn();

await jest.unstable_mockModule('../js/modules/cart.js', () => ({
  clearUserId,
  setUserId,
  syncCartToUser,
  updateBadge,
}));

await jest.unstable_mockModule('../js/modules/toast.js', () => ({
  showToast,
}));

const { initAuth, getAuthState } = await import('../js/modules/auth.js');

function createStorage() {
  const map = new Map();
  return {
    setItem(key, value) { map.set(String(key), String(value)); },
    getItem(key) { return map.has(String(key)) ? map.get(String(key)) : null; },
    removeItem(key) { map.delete(String(key)); },
    clear() { map.clear(); },
  };
}

describe('auth bootstrap resilience', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    global.localStorage = createStorage();
    global.CustomEvent = class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    };
    global.document = {
      dispatchEvent: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      getElementById: jest.fn(() => null),
      querySelectorAll: jest.fn(() => []),
    };
  });

  test('keeps stored session when /api/auth/me fails with non-auth error', async () => {
    localStorage.setItem('insidex_access_token', 'token_123');
    localStorage.setItem('insidex_auth_user', JSON.stringify({ email: 'customer@insidex.test', role: 'customer' }));

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: 'service unavailable' }),
    });

    await initAuth();

    expect(localStorage.getItem('insidex_access_token')).toBe('token_123');
    expect(getAuthState().isAuthenticated).toBe(true);
    expect(clearUserId).not.toHaveBeenCalled();
  });

  test('clears stored session when /api/auth/me returns 401', async () => {
    localStorage.setItem('insidex_access_token', 'token_123');
    localStorage.setItem('insidex_auth_user', JSON.stringify({ email: 'customer@insidex.test', role: 'customer' }));

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'unauthorized' }),
    });

    await initAuth();

    expect(localStorage.getItem('insidex_access_token')).toBeNull();
    expect(getAuthState().isAuthenticated).toBe(false);
    expect(clearUserId).toHaveBeenCalledTimes(1);
  });
});
