import net from 'node:net';
import prisma from '../../src/lib/prisma.js';
import { userRepository } from '../../src/repositories/user.repository.js';
import { productRepository } from '../../src/repositories/product.repository.js';
import { cartRepository } from '../../src/repositories/cart.repository.js';
import { orderRepository } from '../../src/repositories/order.repository.js';

function parseDatabaseHostPort(databaseUrl) {
  try {
    const parsed = new URL(databaseUrl);
    return {
      host: parsed.hostname,
      port: Number(parsed.port || 5432),
    };
  } catch {
    return null;
  }
}

function canReachDatabase({ host, port }, timeoutMs = 400) {
  return new Promise((resolve) => {
    const socket = new net.Socket();

    const finalize = (result) => {
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finalize(true));
    socket.once('timeout', () => finalize(false));
    socket.once('error', () => finalize(false));
    socket.connect(port, host);
  });
}

const hasDbUrl = Boolean(process.env.DATABASE_URL);
const dbTarget = hasDbUrl ? parseDatabaseHostPort(process.env.DATABASE_URL) : null;
const hasReachableDb = dbTarget ? await canReachDatabase(dbTarget) : false;
const describeDb = hasReachableDb ? describe : describe.skip;

describeDb('PostgreSQL integration (EPIC-1.4)', () => {
  let user;
  let product;
  let cart;
  let order;

  afterAll(async () => {
    if (order?.id) {
      await prisma.order.delete({ where: { id: order.id } }).catch(() => {});
    }
    if (cart?.id) {
      await prisma.cart.delete({ where: { id: cart.id } }).catch(() => {});
    }
    if (product?.id) {
      await prisma.product.delete({ where: { id: product.id } }).catch(() => {});
    }
    if (user?.id) {
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    }

    await prisma.$disconnect();
  });

  test('create user, create product, add cart item, create order transaction, and enforce FK', async () => {
    const suffix = Date.now();

    user = await userRepository.create({
      email: `test-integration-${suffix}@example.com`,
      passwordHash: 'already_hashed_password',
      role: 'customer',
    });
    expect(user?.id).toBeTruthy();

    product = await productRepository.create({
      name: `Test Product ${suffix}`,
      description: 'Integration test product',
      price: '39.90',
      stock: 7,
      active: true,
    });
    expect(product?.id).toBeTruthy();

    cart = await cartRepository.create({ userId: user.id });
    const cartItem = await cartRepository.upsertItem(cart.id, product.id, 3);
    expect(cartItem.quantity).toBe(3);

    order = await orderRepository.createWithItemsAndUpdateStock({
      userId: user.id,
      items: [{ productId: product.id, quantity: 3 }],
    });
    expect(order.items).toHaveLength(1);

    const updatedProduct = await productRepository.findById(product.id);
    expect(updatedProduct.stock).toBe(4);

    await expect(
      cartRepository.upsertItem(cart.id, '00000000-0000-0000-0000-000000000000', 1),
    ).rejects.toThrow();
  });
});