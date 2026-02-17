import { jest } from '@jest/globals';
import prisma from '../../src/lib/prisma.js';
import { cartRepository } from '../../src/repositories/cart.repository.js';
import { userRepository } from '../../src/repositories/user.repository.js';

describe('cart/user repository coverage', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('cart repository CRUD/list/upsert delegates to prisma', async () => {
    jest.spyOn(prisma.cart, 'create').mockResolvedValue({ id: 'cart-1' });
    jest.spyOn(prisma.cart, 'findUnique').mockResolvedValue({ id: 'cart-1', items: [] });
    jest.spyOn(prisma.cart, 'update').mockResolvedValue({ id: 'cart-1', note: 'x' });
    jest.spyOn(prisma.cart, 'delete').mockResolvedValue({ id: 'cart-1' });
    jest.spyOn(prisma.cart, 'findMany').mockResolvedValue([{ id: 'cart-1' }]);
    jest.spyOn(prisma.cartItem, 'upsert').mockResolvedValue({ id: 'ci-1' });

    await expect(cartRepository.create({ userId: 'u1' })).resolves.toEqual({ id: 'cart-1' });
    await expect(cartRepository.findById('cart-1')).resolves.toEqual({ id: 'cart-1', items: [] });
    await expect(cartRepository.update('cart-1', { note: 'x' })).resolves.toEqual({ id: 'cart-1', note: 'x' });
    await expect(cartRepository.delete('cart-1')).resolves.toEqual({ id: 'cart-1' });
    await expect(cartRepository.list()).resolves.toEqual([{ id: 'cart-1' }]);
    await expect(cartRepository.upsertItem('cart-1', 'p1', 2)).resolves.toEqual({ id: 'ci-1' });
  });

  test('user repository CRUD/list/finders delegates to prisma', async () => {
    jest.spyOn(prisma.user, 'create').mockResolvedValue({ id: 'u1', email: 'a@x.com', isGuest: false });
    jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({ id: 'u1', email: 'a@x.com' });
    jest.spyOn(prisma.user, 'update').mockResolvedValue({ id: 'u1', email: 'b@x.com' });
    jest.spyOn(prisma.user, 'delete').mockResolvedValue({ id: 'u1' });
    jest.spyOn(prisma.user, 'findMany').mockResolvedValue([{ id: 'u1' }]);

    await expect(userRepository.create({ email: 'a@x.com' })).resolves.toEqual({ id: 'u1', email: 'a@x.com', isGuest: false });
    await expect(userRepository.findById('u1')).resolves.toEqual({ id: 'u1', email: 'a@x.com' });
    await expect(userRepository.findByEmail('a@x.com')).resolves.toEqual({ id: 'u1', email: 'a@x.com' });
    await expect(userRepository.update('u1', { email: 'b@x.com' })).resolves.toEqual({ id: 'u1', email: 'b@x.com' });
    await expect(userRepository.delete('u1')).resolves.toEqual({ id: 'u1' });
    await expect(userRepository.list()).resolves.toEqual([{ id: 'u1' }]);
  });

  test('createGuest provisions guest identity', async () => {
    const findUniqueSpy = jest.spyOn(prisma.user, 'findUnique');
    findUniqueSpy.mockResolvedValueOnce(null);
    jest.spyOn(prisma.user, 'create').mockResolvedValue({ id: 'guest-1', isGuest: true });

    const guest = await userRepository.createGuest({ email: 'real@x.com', address: { line1: 'x' } });
    expect(guest.isGuest).toBe(true);
  });
});