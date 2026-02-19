import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { toMinorUnits, fromMinorUnits } from '../src/utils/minor-units.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const isDryRun = process.argv.includes('--dry-run');

function maskEmail(email = '') {
  const [name = '', domain = ''] = String(email).split('@');
  if (!domain) return '***';
  if (name.length <= 2) return `***@${domain}`;
  return `${name.slice(0, 2)}***@${domain}`;
}

function toDate(value, fallback = new Date()) {
  const d = value ? new Date(value) : fallback;
  return Number.isNaN(d.getTime()) ? fallback : d;
}

function normalizeRole(role) {
  return String(role || '').toLowerCase() === 'admin' ? 'admin' : 'customer';
}

function parsePositiveInt(value, fallback = 0) {
  const normalized = String(value ?? '').trim();
  if (!/^\d+$/.test(normalized)) return fallback;
  const parsed = BigInt(normalized);
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) return fallback;
  return JSON.parse(parsed.toString());
}

function normalizeMoneyDecimal(value, currency = 'EUR') {
  try {
    const minor = toMinorUnits(String(value ?? '0'), currency);
    return fromMinorUnits(minor, currency);
  } catch {
    return fromMinorUnits(0, currency);
  }
}

async function readJsonIfExists(fileName, defaultValue) {
  const filePath = path.join(DATA_DIR, fileName);
  try {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') return defaultValue;
    throw new Error(`Failed to read ${fileName}: ${error.message}`);
  }
}

function transformUsers(usersJson) {
  const input = usersJson?.users && typeof usersJson.users === 'object' ? usersJson.users : {};
  const records = [];
  const legacyIdToUuid = new Map();
  const seenEmail = new Set();
  let duplicateEmailInJson = 0;

  for (const [key, rawUser] of Object.entries(input)) {
    const normalizedEmail = String(rawUser?.email || key || '').trim().toLowerCase();
    if (!normalizedEmail) continue;

    if (seenEmail.has(normalizedEmail)) {
      duplicateEmailInJson += 1;
      console.warn(`[IMPORT][users] duplicate email in JSON skipped: ${maskEmail(normalizedEmail)}`);
      continue;
    }

    seenEmail.add(normalizedEmail);
    const id = crypto.randomUUID();
    legacyIdToUuid.set(rawUser?.id || key, id);

    records.push({
      id,
      email: normalizedEmail,
      passwordHash: String(rawUser?.passwordHash || ''),
      role: normalizeRole(rawUser?.role),
      createdAt: toDate(rawUser?.createdAt),
      updatedAt: toDate(rawUser?.updatedAt, toDate(rawUser?.createdAt)),
    });
  }

  return { records, legacyIdToUuid, duplicateEmailInJson };
}

function transformProducts(productsJson) {
  const input = Array.isArray(productsJson) ? productsJson : [];
  const records = [];
  const legacyIdToUuid = new Map();

  for (const raw of input) {
    const legacyId = String(raw?.id || '').trim();
    if (!legacyId) continue;

    const id = crypto.randomUUID();
    legacyIdToUuid.set(legacyId, id);

    records.push({
      id,
      name: String(raw?.title || raw?.designation || raw?.name || legacyId).slice(0, 255),
      description: raw?.description || raw?.shortDescription || null,
      price: normalizeMoneyDecimal(raw?.price, 'EUR'),
      stock: parsePositiveInt(raw?.stock, 0),
      active: Boolean(raw?.published ?? raw?.active ?? true),
      createdAt: toDate(raw?.createdAt),
      updatedAt: toDate(raw?.updatedAt, toDate(raw?.createdAt)),
    });
  }

  return { records, legacyIdToUuid };
}

function transformLeads(leadsJson) {
  const input = Array.isArray(leadsJson?.leads) ? leadsJson.leads : [];
  return input
    .filter((lead) => lead?.email && lead?.message)
    .map((lead) => ({
      id: crypto.randomUUID(),
      name: String(lead?.name || 'Unknown').slice(0, 255),
      email: String(lead.email).trim().toLowerCase(),
      message: String(lead.message),
      createdAt: toDate(lead?.createdAt),
    }));
}

function transformAnalytics(analyticsJson, userMap) {
  const input = Array.isArray(analyticsJson?.events) ? analyticsJson.events : [];
  return input.map((event) => {
    const legacyUserId = event?.userId || event?.user?.id;
    const mappedUserId = legacyUserId ? userMap.get(legacyUserId) || null : null;

    return {
      id: crypto.randomUUID(),
      eventType: String(event?.event || event?.type || 'unknown').slice(0, 100),
      userId: mappedUserId,
      payload: event?.payload && typeof event.payload === 'object' ? event.payload : event,
      createdAt: toDate(event?.timestamp || event?.createdAt),
    };
  });
}

function transformCarts(cartsJson, userMap, productMap) {
  const usersCarts = cartsJson?.users && typeof cartsJson.users === 'object' ? cartsJson.users : {};
  const carts = [];
  const cartItems = [];

  for (const [legacyUserId, cart] of Object.entries(usersCarts)) {
    const userId = userMap.get(legacyUserId);
    if (!userId) continue;

    const cartId = crypto.randomUUID();
    const ts = toDate(cart?.updatedAt || cart?.createdAt);
    carts.push({ id: cartId, userId, createdAt: ts, updatedAt: ts });

    const itemsObj = cart?.items && typeof cart.items === 'object' ? cart.items : {};
    for (const [legacyProductId, item] of Object.entries(itemsObj)) {
      const productId = productMap.get(legacyProductId);
      if (!productId) continue;

      cartItems.push({
        id: crypto.randomUUID(),
        cartId,
        productId,
        quantity: Math.max(1, parsePositiveInt(item?.qty ?? item?.quantity ?? 1, 1)),
        createdAt: ts,
        updatedAt: ts,
      });
    }
  }

  return { carts, cartItems };
}

function parseQuantity(value) {
  return Math.max(1, parsePositiveInt(value, 1));
}

function transformOrders(ordersJson, userMap, productMap) {
  const input = Array.isArray(ordersJson?.orders) ? ordersJson.orders : [];
  const orders = [];
  const orderItems = [];

  for (const rawOrder of input) {
    const mappedUserId = userMap.get(rawOrder?.userId);
    if (!mappedUserId) continue;

    const orderId = crypto.randomUUID();
    const createdAt = toDate(rawOrder?.createdAt);
    const items = Array.isArray(rawOrder?.items) ? rawOrder.items : [];
    let totalAmountMinor = 0n;

    for (const item of items) {
      const productId = productMap.get(item?.productId);
      if (!productId) continue;
      const quantity = parseQuantity(item?.quantity || 1);
      const unitPriceString = String(item?.unitPrice ?? item?.price ?? '0');
      const unitMinor = BigInt(toMinorUnits(String(unitPriceString), 'EUR'));
      const totalMinor = unitMinor * BigInt(quantity);
      const total = fromMinorUnits(totalMinor, 'EUR');
      totalAmountMinor += BigInt(toMinorUnits(total, 'EUR'));

      orderItems.push({
        id: crypto.randomUUID(),
        orderId,
        productId,
        quantity,
        unitPrice: fromMinorUnits(unitMinor, 'EUR'),
        createdAt,
      });
    }

    orders.push({
      id: orderId,
      userId: mappedUserId,
      status: ['pending', 'paid', 'shipped', 'cancelled'].includes(rawOrder?.status) ? rawOrder.status : 'pending',
      totalAmount: fromMinorUnits(totalAmountMinor, 'EUR'),
      createdAt,
      updatedAt: toDate(rawOrder?.updatedAt, createdAt),
    });
  }

  return { orders, orderItems };
}

async function getPrismaClient() {
  try {
    const mod = await import('../src/lib/prisma.js');
    return mod.default;
  } catch {
    throw new Error('Prisma client unavailable. Run `npm install` to install @prisma/client before import.');
  }
}

async function run() {
  const startedAt = Date.now();

  const usersJson = await readJsonIfExists('users.json', { users: {} });
  const productsJson = await readJsonIfExists('products.json', []);
  const cartsJson = await readJsonIfExists('carts.json', { users: {}, anonymous: {} });
  const leadsJson = await readJsonIfExists('leads.json', { leads: [] });
  const analyticsJson = await readJsonIfExists('analytics.json', { events: [] });
  const ordersJson = await readJsonIfExists('orders.json', { orders: [] });

  const usersData = transformUsers(usersJson);
  const productsData = transformProducts(productsJson);
  const leadsData = transformLeads(leadsJson);
  const analyticsData = transformAnalytics(analyticsJson, usersData.legacyIdToUuid);
  const cartsData = transformCarts(cartsJson, usersData.legacyIdToUuid, productsData.legacyIdToUuid);
  const ordersData = transformOrders(ordersJson, usersData.legacyIdToUuid, productsData.legacyIdToUuid);

  const expected = {
    users: usersData.records.length,
    products: productsData.records.length,
    carts: cartsData.carts.length,
    cartItems: cartsData.cartItems.length,
    orders: ordersData.orders.length,
    orderItems: ordersData.orderItems.length,
    leads: leadsData.length,
    analyticsEvents: analyticsData.length,
  };

  if (isDryRun) {
    console.log('[IMPORT][DRY_RUN] No data will be written.');
    console.log('[IMPORT][SUMMARY]', JSON.stringify({ expected, duplicateEmailInJson: usersData.duplicateEmailInJson }, null, 2));
    return;
  }

  const prisma = await getPrismaClient();

  try {
    const existingEmails = new Set(
      (await prisma.user.findMany({ select: { email: true } })).map((u) => u.email.toLowerCase())
    );

    const usersToInsert = usersData.records.filter((u) => {
      if (existingEmails.has(u.email)) {
        console.warn(`[IMPORT][users] email already exists in DB, skipped: ${maskEmail(u.email)}`);
        return false;
      }
      return true;
    });

    const inserted = await prisma.$transaction(async (tx) => {
      const out = { users: 0, products: 0, carts: 0, cartItems: 0, orders: 0, orderItems: 0, leads: 0, analyticsEvents: 0 };

      if (usersToInsert.length) out.users = (await tx.user.createMany({ data: usersToInsert, skipDuplicates: true })).count;
      if (productsData.records.length) out.products = (await tx.product.createMany({ data: productsData.records, skipDuplicates: true })).count;
      if (leadsData.length) out.leads = (await tx.lead.createMany({ data: leadsData, skipDuplicates: true })).count;
      if (analyticsData.length) out.analyticsEvents = (await tx.analyticsEvent.createMany({ data: analyticsData, skipDuplicates: true })).count;
      if (cartsData.carts.length) out.carts = (await tx.cart.createMany({ data: cartsData.carts, skipDuplicates: true })).count;
      if (cartsData.cartItems.length) out.cartItems = (await tx.cartItem.createMany({ data: cartsData.cartItems, skipDuplicates: true })).count;
      if (ordersData.orders.length) out.orders = (await tx.order.createMany({ data: ordersData.orders, skipDuplicates: true })).count;
      if (ordersData.orderItems.length) out.orderItems = (await tx.orderItem.createMany({ data: ordersData.orderItems, skipDuplicates: true })).count;

      return out;
    });

    const summary = {
      dryRun: false,
      durationMs: Date.now() - startedAt,
      expected,
      inserted,
      duplicateEmailInJson: usersData.duplicateEmailInJson,
      usersSkippedBecauseEmailExistsInDb: usersData.records.length - usersToInsert.length,
      match: {
        users: inserted.users === usersToInsert.length,
        products: inserted.products === expected.products,
        carts: inserted.carts === expected.carts,
        cartItems: inserted.cartItems === expected.cartItems,
        orders: inserted.orders === expected.orders,
        orderItems: inserted.orderItems === expected.orderItems,
        leads: inserted.leads === expected.leads,
        analyticsEvents: inserted.analyticsEvents === expected.analyticsEvents,
      },
    };

    console.log('[IMPORT][SUMMARY]', JSON.stringify(summary, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

run().catch((error) => {
  console.error('[IMPORT][FATAL]', JSON.stringify({
    message: error?.message,
    code: error?.code,
    meta: error?.meta,
  }));
  process.exitCode = 1;
});