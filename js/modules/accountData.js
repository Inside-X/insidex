import { getUserId } from './cart.js';

const ACCOUNT_STORAGE_KEY = 'insidex_customer_accounts';
const LAST_ACCOUNT_EMAIL_KEY = 'insidex_last_account_email';
const AUTH_USER_KEY = 'insidex_auth_user';

function safeParse(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function loadAccounts() {
  return safeParse(localStorage.getItem(ACCOUNT_STORAGE_KEY), {});
}

function saveAccounts(accounts) {
  localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(accounts));
}

function normaliseEmail(email) {
  return (email || '').trim().toLowerCase();
}

export function getActiveEmail() {
  const userId = getUserId();
  if (userId) return normaliseEmail(userId);
  const authUser = safeParse(localStorage.getItem(AUTH_USER_KEY), null);
  if (authUser?.email) return normaliseEmail(authUser.email);
  return normaliseEmail(localStorage.getItem(LAST_ACCOUNT_EMAIL_KEY));
}

export function setActiveEmail(email) {
  if (!email) return;
  localStorage.setItem(LAST_ACCOUNT_EMAIL_KEY, normaliseEmail(email));
}

export function getAccount(email) {
  if (!email) {
    return { profile: null, addresses: [], orders: [] };
  }
  const accounts = loadAccounts();
  return accounts[normaliseEmail(email)] || { profile: null, addresses: [], orders: [] };
}

export function upsertProfile(email, profile) {
  if (!email) return null;
  const accounts = loadAccounts();
  const key = normaliseEmail(email);
  const existing = accounts[key] || { profile: {}, addresses: [], orders: [] };
  accounts[key] = {
    ...existing,
    profile: {
      ...existing.profile,
      ...profile,
      email: key
    }
  };
  saveAccounts(accounts);
  setActiveEmail(key);
  return accounts[key];
}

export function addAddress(email, address) {
  if (!email || !address) return null;
  const accounts = loadAccounts();
  const key = normaliseEmail(email);
  const existing = accounts[key] || { profile: {}, addresses: [], orders: [] };
  const addresses = existing.addresses || [];
  const signature = `${address.line}|${address.postalCode}|${address.city}|${address.country}`.toLowerCase();
  const alreadyExists = addresses.some((entry) => {
    const entrySignature = `${entry.line}|${entry.postalCode}|${entry.city}|${entry.country}`.toLowerCase();
    return entrySignature === signature;
  });
  if (!alreadyExists) {
    addresses.unshift({ ...address });
  }
  accounts[key] = { ...existing, addresses };
  saveAccounts(accounts);
  setActiveEmail(key);
  return accounts[key];
}

export function addOrder(email, order) {
  if (!email || !order) return null;
  const accounts = loadAccounts();
  const key = normaliseEmail(email);
  const existing = accounts[key] || { profile: {}, addresses: [], orders: [] };
  const orders = existing.orders || [];
  orders.unshift({ ...order });
  accounts[key] = { ...existing, orders };
  saveAccounts(accounts);
  setActiveEmail(key);
  return accounts[key];
}

export function renameAccount(oldEmail, newEmail) {
  if (!oldEmail || !newEmail) return null;
  const accounts = loadAccounts();
  const oldKey = normaliseEmail(oldEmail);
  const newKey = normaliseEmail(newEmail);
  if (oldKey === newKey) return accounts[newKey] || null;
  if (!accounts[oldKey]) return null;
  accounts[newKey] = {
    ...accounts[oldKey],
    profile: {
      ...accounts[oldKey].profile,
      email: newKey
    }
  };
  delete accounts[oldKey];
  saveAccounts(accounts);
  setActiveEmail(newKey);
  return accounts[newKey];
}