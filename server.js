import express from 'express';
import { readFile, writeFile } from 'fs/promises';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;
const SITE_BASE_URL = (process.env.SITE_BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');

app.use(express.static(__dirname));
app.use(express.json());

async function loadProducts() {
  const filePath = path.join(__dirname, 'data', 'products.json');
  const content = await readFile(filePath, 'utf-8');
  const products = JSON.parse(content);
  return Array.isArray(products) ? products : [];
}

const CARTS_PATH = path.join(__dirname, 'data', 'carts.json');
const USERS_PATH = path.join(__dirname, 'data', 'users.json');
const LEADS_PATH = path.join(__dirname, 'data', 'leads.json');
const ABANDONED_PATH = path.join(__dirname, 'data', 'abandoned.json');
const ANALYTICS_PATH = path.join(__dirname, 'data', 'analytics.json');
const JWT_SECRET = process.env.JWT_SECRET || 'insidex-demo-secret';
const ACCESS_TOKEN_TTL = 60 * 15;
const REFRESH_TOKEN_TTL = 60 * 60 * 24 * 7;
const RESET_TOKEN_TTL = 60 * 30;

const ABANDONED_CART_DELAY_MS = Number(process.env.ABANDONED_CART_DELAY_MS) || 1000 * 60 * 30;

const abandonedTimers = new Map();

function escapeXml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildProductPageHtml({ product, html }) {
  const canonicalPath = product.slug
    ? `/produits/${encodeURIComponent(product.slug)}`
    : `/product.html?id=${encodeURIComponent(product.id)}`;
  const canonicalUrl = `${SITE_BASE_URL}${canonicalPath}`;
  const title = `${product.title} | Inside X`;
  const description = (product.shortDescription || product.description || `Découvrez ${product.title} sur Inside X.`).trim();
  const image = product.images?.[0]
    ? `${SITE_BASE_URL}/${String(product.images[0]).replace(/^\//, '')}`
    : `${SITE_BASE_URL}/assets/images/logo-inside-home.png`;

  return html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(/<meta name="description" content="[\s\S]*?"\s*\/>/, `<meta name="description" content="${escapeHtml(description)}" />`)
    .replace(/<meta name="robots" content="[\s\S]*?"\s*\/>/, '<meta name="robots" content="index,follow" />')
    .replace(/<link rel="canonical" href="[\s\S]*?"\s*\/>/, `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`)
    .replace(/<meta property="og:title" content="[\s\S]*?"\s*\/>/, `<meta property="og:title" content="${escapeHtml(title)}" />`)
    .replace(/<meta property="og:description" content="[\s\S]*?"\s*\/>/, `<meta property="og:description" content="${escapeHtml(description)}" />`)
    .replace(/<meta property="og:image" content="[\s\S]*?"\s*\/>/, `<meta property="og:image" content="${escapeHtml(image)}" />`)
    .replace(/<meta property="og:url" content="[\s\S]*?"\s*\/>/, `<meta property="og:url" content="${escapeHtml(canonicalUrl)}" />`);
}

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLength), 'base64').toString('utf-8');
}

function signToken(payload, expiresInSeconds) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const body = { ...payload, exp };
  const headerPart = base64UrlEncode(JSON.stringify(header));
  const payloadPart = base64UrlEncode(JSON.stringify(body));
  const data = `${headerPart}.${payloadPart}`;
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(data)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${data}.${signature}`;
}

function verifyToken(token) {
  if (!token) return null;
  const [headerPart, payloadPart, signature] = token.split('.');
  if (!headerPart || !payloadPart || !signature) return null;
  const data = `${headerPart}.${payloadPart}`;
  const expected = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(data)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  if (expected.length !== signature.length) {
    return null;
  }
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
    return null;
  }
  const payload = JSON.parse(base64UrlDecode(payloadPart));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  return payload;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 120000, 64, 'sha512').toString('hex');
}

async function loadUsers() {
  try {
    const content = await readFile(USERS_PATH, 'utf-8');
    const data = JSON.parse(content);
    return {
      users: data?.users ?? {}
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      const empty = { users: {} };
      await writeFile(USERS_PATH, JSON.stringify(empty, null, 2), 'utf-8');
      return empty;
    }
    throw error;
  }
}

async function saveUsers(data) {
  await writeFile(USERS_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function normalizeUserRole(role) {
  const normalized = typeof role === 'string' ? role.trim().toLowerCase() : '';
  return normalized === 'admin' ? 'admin' : 'customer';
}

function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: normalizeUserRole(user.role)
  };
}

async function loadCarts() {
  try {
    const content = await readFile(CARTS_PATH, 'utf-8');
    const carts = JSON.parse(content);
    return {
      users: carts?.users ?? {},
      anonymous: carts?.anonymous ?? {}
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      const empty = { users: {}, anonymous: {} };
      await writeFile(CARTS_PATH, JSON.stringify(empty, null, 2), 'utf-8');
      return empty;
    }
    throw error;
  }
}

async function saveCarts(carts) {
  await writeFile(CARTS_PATH, JSON.stringify(carts, null, 2), 'utf-8');
}

async function loadLeads() {
  try {
    const content = await readFile(LEADS_PATH, 'utf-8');
    const data = JSON.parse(content);
    return {
      leads: Array.isArray(data?.leads) ? data.leads : [],
      notifications: Array.isArray(data?.notifications) ? data.notifications : []
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      const empty = { leads: [], notifications: [] };
      await writeFile(LEADS_PATH, JSON.stringify(empty, null, 2), 'utf-8');
      return empty;
    }
    throw error;
  }
}

async function saveLeads(data) {
  await writeFile(LEADS_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

async function loadAbandoned() {
  try {
    const content = await readFile(ABANDONED_PATH, 'utf-8');
    const data = JSON.parse(content);
    return {
      reminders: Array.isArray(data?.reminders) ? data.reminders : [],
      notifications: Array.isArray(data?.notifications) ? data.notifications : []
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      const empty = { reminders: [], notifications: [] };
      await writeFile(ABANDONED_PATH, JSON.stringify(empty, null, 2), 'utf-8');
      return empty;
    }
    throw error;
  }
}

async function saveAbandoned(data) {
  await writeFile(ABANDONED_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

async function loadAnalytics() {
  try {
    const content = await readFile(ANALYTICS_PATH, 'utf-8');
    const data = JSON.parse(content);
    return {
      events: Array.isArray(data?.events) ? data.events : []
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      const empty = { events: [] };
      await writeFile(ANALYTICS_PATH, JSON.stringify(empty, null, 2), 'utf-8');
      return empty;
    }
    throw error;
  }
}

async function saveAnalytics(data) {
  await writeFile(ANALYTICS_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function summarizeConversion(events) {
  const tracked = events.filter((event) => ['add_to_cart', 'begin_checkout', 'purchase'].includes(event.event));
  const grouped = tracked.reduce((acc, event) => {
    const key = event.event;
    if (!acc[key]) acc[key] = 0;
    acc[key] += 1;
    return acc;
  }, {});

  const addToCart = grouped.add_to_cart || 0;
  const beginCheckout = grouped.begin_checkout || 0;
  const purchase = grouped.purchase || 0;

  const checkoutRate = addToCart > 0 ? beginCheckout / addToCart : 0;
  const purchaseRate = beginCheckout > 0 ? purchase / beginCheckout : 0;

  return {
    addToCart,
    beginCheckout,
    purchase,
    checkoutRate,
    purchaseRate
  };
}

function recordLeadNotification({ notifications, lead }) {
  const notification = {
    id: crypto.randomUUID(),
    leadId: lead.id,
    email: lead.email,
    channel: 'email',
    status: 'queued',
    createdAt: new Date().toISOString()
  };
  notifications.push(notification);
  console.log('Notification lead envoyée:', notification);
  return notification;
}

function cartHasItems(cart) {
  return cart && Object.keys(cart.items || {}).length > 0;
}

function buildCartSnapshot(cart) {
  return Object.entries(cart.items || {}).map(([id, item]) => ({
    id,
    name: item.name,
    qty: item.qty,
    price: item.price
  }));
}

function clearAbandonedTimer(key) {
  const timer = abandonedTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    abandonedTimers.delete(key);
  }
}

function scheduleAbandonedTimer(key, delayMs, callback) {
  clearAbandonedTimer(key);
  const timer = setTimeout(callback, delayMs);
  abandonedTimers.set(key, timer);
}

async function sendAbandonedEmail(userId) {
  const data = await loadAbandoned();
  const reminder = data.reminders.find((entry) => entry.userId === userId && entry.status === 'pending');
  if (!reminder) {
    clearAbandonedTimer(`user:${userId}`);
    return;
  }
  const reminderAt = new Date(reminder.reminderAt).getTime();
  if (Number.isNaN(reminderAt) || reminderAt > Date.now()) {
    scheduleAbandonedTimer(`user:${userId}`, Math.max(reminderAt - Date.now(), 1000), () => {
      void sendAbandonedEmail(userId);
    });
    return;
  }
  reminder.status = 'sent';
  reminder.sentAt = new Date().toISOString();
  const notification = {
    id: crypto.randomUUID(),
    reminderId: reminder.id,
    userId,
    email: userId,
    channel: 'email',
    status: 'sent',
    createdAt: reminder.createdAt,
    sentAt: reminder.sentAt,
    items: reminder.items
  };
  data.notifications.push(notification);
  await saveAbandoned(data);
  console.log('Email panier abandonné envoyé:', notification);
  clearAbandonedTimer(`user:${userId}`);
}

async function updateAbandonedReminder({ userId, cart }) {
  if (!userId) {
    return;
  }
  const key = `user:${userId}`;
  const data = await loadAbandoned();
  const reminder = data.reminders.find((entry) => entry.userId === userId && entry.status === 'pending');
  if (!cartHasItems(cart)) {
    if (reminder) {
      reminder.status = 'cancelled';
      reminder.cancelledAt = new Date().toISOString();
      await saveAbandoned(data);
    }
    clearAbandonedTimer(key);
    return;
  }
  const reminderAt = new Date(Date.now() + ABANDONED_CART_DELAY_MS).toISOString();
  if (reminder) {
    reminder.items = buildCartSnapshot(cart);
    reminder.reminderAt = reminderAt;
    reminder.updatedAt = new Date().toISOString();
  } else {
    data.reminders.push({
      id: crypto.randomUUID(),
      userId,
      email: userId,
      status: 'pending',
      items: buildCartSnapshot(cart),
      createdAt: new Date().toISOString(),
      reminderAt
    });
  }
  await saveAbandoned(data);
  const delayMs = Math.max(new Date(reminderAt).getTime() - Date.now(), 1000);
  scheduleAbandonedTimer(key, delayMs, () => {
    void sendAbandonedEmail(userId);
  });
}

async function primeAbandonedReminders() {
  const data = await loadAbandoned();
  data.reminders
    .filter((reminder) => reminder.status === 'pending')
    .forEach((reminder) => {
      const delayMs = Math.max(new Date(reminder.reminderAt).getTime() - Date.now(), 1000);
      scheduleAbandonedTimer(`user:${reminder.userId}`, delayMs, () => {
        void sendAbandonedEmail(reminder.userId);
      });
    });
}

function normalizeCart(cart) {
  return {
    items: cart?.items ?? {}
  };
}

function resolveCartBucket(carts, { userId, anonId }) {
  if (userId) {
    if (!carts.users[userId]) {
      carts.users[userId] = normalizeCart();
    }
    return { bucket: carts.users, key: userId };
  }
  if (!anonId) {
    return null;
  }
  if (!carts.anonymous[anonId]) {
    carts.anonymous[anonId] = normalizeCart();
  }
  return { bucket: carts.anonymous, key: anonId };
}

app.get('/api/cart', async (req, res) => {
  try {
    const carts = await loadCarts();
    const bucketInfo = resolveCartBucket(carts, {
      userId: req.query.userId,
      anonId: req.query.anonId
    });
    if (!bucketInfo) {
      return res.status(400).json({ error: 'Identifiant manquant.' });
    }
    const cart = normalizeCart(bucketInfo.bucket[bucketInfo.key]);
    return res.json(cart);
  } catch (error) {
    console.error('Erreur chargement panier:', error);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

app.post('/api/cart/items', async (req, res) => {
  try {
    const { id, name, price, qty = 1, userId, anonId } = req.body;
    if (!id || !name) {
      return res.status(400).json({ error: 'Produit invalide.' });
    }
    const carts = await loadCarts();
    const bucketInfo = resolveCartBucket(carts, { userId, anonId });
    if (!bucketInfo) {
      return res.status(400).json({ error: 'Identifiant manquant.' });
    }
    const cart = normalizeCart(bucketInfo.bucket[bucketInfo.key]);
    if (!cart.items[id]) {
      cart.items[id] = { name, price: Number(price), qty: 0 };
    }
    cart.items[id].qty += Math.max(1, Number(qty));
    bucketInfo.bucket[bucketInfo.key] = cart;
    await saveCarts(carts);
    await updateAbandonedReminder({ userId, cart });
    return res.json(cart);
  } catch (error) {
    console.error('Erreur ajout panier:', error);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

app.patch('/api/cart/items/:id', async (req, res) => {
  try {
    const { userId, anonId, qty } = req.body;
    const carts = await loadCarts();
    const bucketInfo = resolveCartBucket(carts, { userId, anonId });
    if (!bucketInfo) {
      return res.status(400).json({ error: 'Identifiant manquant.' });
    }
    const cart = normalizeCart(bucketInfo.bucket[bucketInfo.key]);
    if (!cart.items[req.params.id]) {
      return res.status(404).json({ error: 'Article introuvable.' });
    }
    cart.items[req.params.id].qty = Math.max(1, Number(qty));
    bucketInfo.bucket[bucketInfo.key] = cart;
    await saveCarts(carts);
    await updateAbandonedReminder({ userId, cart });
    return res.json(cart);
  } catch (error) {
    console.error('Erreur mise à jour panier:', error);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

app.delete('/api/cart/items/:id', async (req, res) => {
  try {
    const { userId, anonId } = req.body;
    const carts = await loadCarts();
    const bucketInfo = resolveCartBucket(carts, { userId, anonId });
    if (!bucketInfo) {
      return res.status(400).json({ error: 'Identifiant manquant.' });
    }
    const cart = normalizeCart(bucketInfo.bucket[bucketInfo.key]);
    delete cart.items[req.params.id];
    bucketInfo.bucket[bucketInfo.key] = cart;
    await saveCarts(carts);
    await updateAbandonedReminder({ userId, cart });
    return res.json(cart);
  } catch (error) {
    console.error('Erreur suppression panier:', error);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

app.delete('/api/cart', async (req, res) => {
  try {
    const { userId, anonId } = req.body;
    const carts = await loadCarts();
    const bucketInfo = resolveCartBucket(carts, { userId, anonId });
    if (!bucketInfo) {
      return res.status(400).json({ error: 'Identifiant manquant.' });
    }
    bucketInfo.bucket[bucketInfo.key] = normalizeCart();
    await saveCarts(carts);
    await updateAbandonedReminder({ userId, cart: bucketInfo.bucket[bucketInfo.key] });
    return res.json(bucketInfo.bucket[bucketInfo.key]);
  } catch (error) {
    console.error('Erreur vidage panier:', error);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

app.post('/api/cart/sync', async (req, res) => {
  try {
    const { anonId, userId } = req.body;
    if (!anonId || !userId) {
      return res.status(400).json({ error: 'Identifiant manquant.' });
    }
    const carts = await loadCarts();
    const anonCart = normalizeCart(carts.anonymous[anonId]);
    const userCart = normalizeCart(carts.users[userId]);
    Object.entries(anonCart.items).forEach(([id, item]) => {
      if (!userCart.items[id]) {
        userCart.items[id] = { ...item };
      } else {
        userCart.items[id].qty += item.qty;
      }
    });
    carts.users[userId] = userCart;
    delete carts.anonymous[anonId];
    await saveCarts(carts);
    await updateAbandonedReminder({ userId, cart: userCart });
    return res.json(userCart);
  } catch (error) {
    console.error('Erreur sync panier:', error);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis.' });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    const usersData = await loadUsers();
    if (usersData.users[normalizedEmail]) {
      return res.status(409).json({ error: 'Un compte existe déjà.' });
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);
    const user = {
      id: crypto.randomUUID(),
      email: normalizedEmail,
      name: name ? String(name).trim() : normalizedEmail.split('@')[0],
      salt,
      passwordHash,
      refreshTokenHash: null,
      resetToken: null,
      resetTokenExpires: null,
      role: 'customer'
    };
    const accessToken = signToken({ sub: user.id, email: user.email, role: user.role, type: 'access' }, ACCESS_TOKEN_TTL);
    const refreshToken = signToken({ sub: user.id, email: user.email, role: user.role, type: 'refresh' }, REFRESH_TOKEN_TTL);
    user.refreshTokenHash = hashToken(refreshToken);
    usersData.users[normalizedEmail] = user;
    await saveUsers(usersData);
    return res.status(201).json({
      user: sanitizeUser(user),
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_TTL
    });
  } catch (error) {
    console.error('Erreur inscription:', error);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis.' });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    const usersData = await loadUsers();
    const user = usersData.users[normalizedEmail];
    if (!user) {
      return res.status(401).json({ error: 'Identifiants invalides.' });
    }
    const candidateHash = hashPassword(password, user.salt);
    if (candidateHash !== user.passwordHash) {
      return res.status(401).json({ error: 'Identifiants invalides.' });
    }
    user.role = normalizeUserRole(user.role);
    const accessToken = signToken({ sub: user.id, email: user.email, role: user.role, type: 'access' }, ACCESS_TOKEN_TTL);
    const refreshToken = signToken({ sub: user.id, email: user.email, role: user.role, type: 'refresh' }, REFRESH_TOKEN_TTL);
    user.refreshTokenHash = hashToken(refreshToken);
    usersData.users[normalizedEmail] = user;
    await saveUsers(usersData);
    return res.json({
      user: sanitizeUser(user),
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_TTL
    });
  } catch (error) {
    console.error('Erreur login:', error);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const payload = verifyToken(refreshToken);
    if (!payload || payload.type !== 'refresh') {
      return res.status(401).json({ error: 'Token invalide.' });
    }
    const usersData = await loadUsers();
    const user = usersData.users[payload.email];
    if (!user || !user.refreshTokenHash) {
      return res.status(401).json({ error: 'Session expirée.' });
    }
    if (hashToken(refreshToken) !== user.refreshTokenHash) {
      return res.status(401).json({ error: 'Session expirée.' });
    }
    user.role = normalizeUserRole(user.role);
    const accessToken = signToken({ sub: user.id, email: user.email, role: user.role, type: 'access' }, ACCESS_TOKEN_TTL);
    return res.json({
      user: sanitizeUser(user),
      accessToken,
      expiresIn: ACCESS_TOKEN_TTL
    });
  } catch (error) {
    console.error('Erreur refresh:', error);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});


app.get('/api/auth/me', async (req, res) => {
  try {
    const authorizationHeader = req.headers.authorization || '';
    const [scheme, token] = authorizationHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Authentification requise.' });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return res.status(401).json({ error: 'Token invalide ou expiré.' });
    }

    if (payload.type !== 'access') {
      return res.status(403).json({ error: 'Token non autorisé pour ce endpoint.' });
    }

    const usersData = await loadUsers();
    const user = usersData.users[payload.email];
    if (!user) {
      return res.status(401).json({ error: 'Session invalide.' });
    }

    user.role = normalizeUserRole(user.role);
    usersData.users[payload.email] = user;
    await saveUsers(usersData);

    return res.json({
      user: sanitizeUser(user)
    });
  } catch (error) {
    console.error('Erreur profil auth:', error);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const payload = verifyToken(refreshToken);
    if (!payload) {
      return res.json({ ok: true });
    }
    const usersData = await loadUsers();
    const user = usersData.users[payload.email];
    if (user) {
      user.refreshTokenHash = null;
      usersData.users[payload.email] = user;
      await saveUsers(usersData);
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error('Erreur logout:', error);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

app.post('/api/auth/forgot', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email requis.' });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    const usersData = await loadUsers();
    const user = usersData.users[normalizedEmail];
    if (!user) {
      return res.status(404).json({ error: 'Compte introuvable.' });
    }
    const resetToken = crypto.randomBytes(16).toString('hex');
    user.resetToken = resetToken;
    user.resetTokenExpires = Date.now() + RESET_TOKEN_TTL * 1000;
    usersData.users[normalizedEmail] = user;
    await saveUsers(usersData);
    return res.json({
      message: 'Un lien de réinitialisation a été généré.',
      resetToken
    });
  } catch (error) {
    console.error('Erreur forgot:', error);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

app.post('/api/auth/reset', async (req, res) => {
  try {
    const { email, resetToken, newPassword } = req.body;
    if (!email || !resetToken || !newPassword) {
      return res.status(400).json({ error: 'Informations manquantes.' });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    const usersData = await loadUsers();
    const user = usersData.users[normalizedEmail];
    if (!user || !user.resetToken) {
      return res.status(400).json({ error: 'Token invalide.' });
    }
    if (user.resetToken !== resetToken || Date.now() > user.resetTokenExpires) {
      return res.status(400).json({ error: 'Token expiré.' });
    }
    const salt = crypto.randomBytes(16).toString('hex');
    user.salt = salt;
    user.passwordHash = hashPassword(newPassword, salt);
    user.resetToken = null;
    user.resetTokenExpires = null;
    usersData.users[normalizedEmail] = user;
    await saveUsers(usersData);
    return res.json({ message: 'Mot de passe mis à jour.' });
  } catch (error) {
    console.error('Erreur reset:', error);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});


app.post('/api/analytics/events', async (req, res) => {
  try {
    const { event, payload = {}, source = 'web', path: pagePath = '', sessionId } = req.body;
    if (!event) {
      return res.status(400).json({ error: 'Event requis.' });
    }

    const data = await loadAnalytics();
    data.events.push({
      id: crypto.randomUUID(),
      event: String(event),
      payload,
      source: String(source),
      path: String(pagePath),
      sessionId: sessionId ? String(sessionId) : null,
      createdAt: new Date().toISOString()
    });
    await saveAnalytics(data);
    return res.status(201).json({ ok: true });
  } catch (error) {
    console.error('Erreur tracking analytics:', error);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

app.get('/api/analytics/conversion', async (req, res) => {
  try {
    const data = await loadAnalytics();
    const summary = summarizeConversion(data.events);
    return res.json(summary);
  } catch (error) {
    console.error('Erreur dashboard conversion:', error);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

app.get('/api/leads', async (req, res) => {
  try {
    const { leads } = await loadLeads();
    const sorted = [...leads].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return res.json(sorted);
  } catch (error) {
    console.error('Erreur chargement leads:', error);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

app.post('/api/leads', async (req, res) => {
  try {
    const { email, source } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email requis.' });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    if (!normalizedEmail.includes('@')) {
      return res.status(400).json({ error: 'Email invalide.' });
    }
    const data = await loadLeads();
    const lead = {
      id: crypto.randomUUID(),
      email: normalizedEmail,
      source: source ? String(source).trim() : 'web',
      status: 'new',
      createdAt: new Date().toISOString()
    };
    data.leads.push(lead);
    const notification = recordLeadNotification({ notifications: data.notifications, lead });
    await saveLeads(data);
    return res.status(201).json({ lead, notification });
  } catch (error) {
    console.error('Erreur création lead:', error);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

function applyFilters(products, filters) {
  const {
    category,
    published,
    featured,
    minPrice,
    maxPrice,
    q
  } = filters;

  return products.filter((product) => {
    if (category && product.category !== category) return false;
    if (published !== undefined && product.published !== published) return false;
    if (featured !== undefined && product.featured !== featured) return false;
    if (minPrice !== undefined && product.price < minPrice) return false;
    if (maxPrice !== undefined && product.price > maxPrice) return false;
    if (q) {
      const haystack = `${product.title} ${product.shortDescription ?? ''} ${product.description ?? ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

app.get('/api/products', async (req, res) => {
  try {
    const products = await loadProducts();
    const { slug } = req.query;

    if (slug) {
      const match = products.find((product) => product.slug === slug);
      if (!match) {
        return res.status(404).json({ error: 'Produit introuvable.' });
      }
      return res.json(match);
    }

    const filters = {
      category: req.query.category,
      published: req.query.published ? req.query.published === 'true' : undefined,
      featured: req.query.featured ? req.query.featured === 'true' : undefined,
      minPrice: req.query.minPrice ? Number(req.query.minPrice) : undefined,
      maxPrice: req.query.maxPrice ? Number(req.query.maxPrice) : undefined,
      q: req.query.q ? String(req.query.q).toLowerCase() : ''
    };

    const filtered = applyFilters(products, filters);
    return res.json(filtered);
  } catch (error) {
    console.error('Erreur chargement produits:', error);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const products = await loadProducts();
    const match = products.find((product) => product.id === req.params.id);
    if (!match) {
      return res.status(404).json({ error: 'Produit introuvable.' });
    }
    return res.json(match);
  } catch (error) {
    console.error('Erreur chargement produit:', error);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});


app.get('/produits/:slug', async (req, res) => {
  try {
    const products = await loadProducts();
    const product = products.find((item) => item.slug === req.params.slug && item.published !== false);
    if (!product) {
      return res.status(404).sendFile(path.join(__dirname, 'product.html'));
    }

    const html = await readFile(path.join(__dirname, 'product.html'), 'utf-8');
    const seoHtml = buildProductPageHtml({ product, html });
    return res.status(200).type('html').send(seoHtml);
  } catch (error) {
    console.error('Erreur rendu page produit SEO:', error);
    return res.status(500).send('Erreur serveur.');
  }
});

app.get('/robots.txt', (req, res) => {
  const robots = [
    'User-agent: *',
    'Allow: /',
    `Sitemap: ${SITE_BASE_URL}/sitemap.xml`
  ].join('\n');
  return res.type('text/plain').send(`${robots}\n`);
});

app.get('/sitemap.xml', async (req, res) => {
  try {
    const products = await loadProducts();
    const now = new Date().toISOString();
    const urls = [
      { loc: `${SITE_BASE_URL}/`, lastmod: now },
      { loc: `${SITE_BASE_URL}/index.html`, lastmod: now },
      { loc: `${SITE_BASE_URL}/product.html`, lastmod: now },
      ...products
        .filter((product) => product.published !== false && product.slug)
        .map((product) => ({
          loc: `${SITE_BASE_URL}/produits/${encodeURIComponent(product.slug)}`,
          lastmod: product.updatedAt || product.createdAt || now
        }))
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n`
      + `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`
      + urls.map((entry) => `  <url><loc>${escapeXml(entry.loc)}</loc><lastmod>${escapeXml(entry.lastmod)}</lastmod></url>`).join('\n')
      + `\n</urlset>`;

    return res.type('application/xml').send(xml);
  } catch (error) {
    console.error('Erreur génération sitemap:', error);
    return res.status(500).send('Erreur serveur.');
  }
});

app.listen(PORT, () => {
  console.log(`InsideX server running on http://localhost:${PORT}`);
});

void primeAbandonedReminders();