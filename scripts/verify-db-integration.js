import prisma from '../src/lib/prisma.js';
import { userRepository } from '../src/repositories/user.repository.js';
import { productRepository } from '../src/repositories/product.repository.js';
import { cartRepository } from '../src/repositories/cart.repository.js';
import { orderRepository } from '../src/repositories/order.repository.js';

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function run() {
  requiredEnv('DATABASE_URL');

  const suffix = Date.now();
  const userEmail = `integration-${suffix}@example.com`;

  let user;
  let product;
  let cart;
  let order;

  try {
    console.log('[verify-db] Checking database connectivity...');
    await prisma.$queryRaw`SELECT 1`;

    console.log('[verify-db] Step 1/5: create user');
    user = await userRepository.create({
      email: userEmail,
      passwordHash: 'already_hashed_value',
      role: 'customer',
    });

    console.log('[verify-db] Step 2/5: create product');
    product = await productRepository.create({
      name: `Integration Product ${suffix}`,
      description: 'DB integration test product',
      price: '49.99',
      stock: 5,
      active: true,
    });

    console.log('[verify-db] Step 3/5: add cart item');
    cart = await cartRepository.create({ userId: user.id });
    const cartItem = await cartRepository.upsertItem(cart.id, product.id, 2);

    if (!cartItem || cartItem.quantity !== 2) {
      throw new Error('Cart item insert check failed.');
    }

    console.log('[verify-db] Step 4/5: create order transaction with stock update');
    order = await orderRepository.createWithItemsAndUpdateStock({
      userId: user.id,
      items: [{ productId: product.id, quantity: 2 }],
      status: 'pending',
    });

    const refreshedProduct = await productRepository.findById(product.id);
    if (!refreshedProduct || refreshedProduct.stock !== 3) {
      throw new Error(`Stock update check failed. Expected 3, got ${refreshedProduct?.stock ?? 'null'}.`);
    }

    console.log('[verify-db] Step 5/5: FK checks (expected failures)');
    let fkFailed = false;
    try {
      await cartRepository.upsertItem(cart.id, '00000000-0000-0000-0000-000000000000', 1);
    } catch {
      fkFailed = true;
    }

    if (!fkFailed) {
      throw new Error('FK constraint check failed: invalid productId should fail.');
    }

    console.log('[verify-db] SUCCESS: integration checks passed.');
    console.log(
      JSON.stringify(
        {
          userId: user.id,
          productId: product.id,
          cartId: cart.id,
          orderId: order.id,
          orderItems: order.items.length,
        },
        null,
        2,
      ),
    );
  } finally {
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
  }
}

run().catch(async (error) => {
  console.error('[verify-db] FAILURE:', error.message);
  await prisma.$disconnect();
  process.exit(1);
});