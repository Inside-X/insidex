import { jest } from '@jest/globals';
import prisma from '../../src/lib/prisma.js';
import { analyticsRepository } from '../../src/repositories/analytics.repository.js';
import { leadRepository } from '../../src/repositories/lead.repository.js';
import { productRepository } from '../../src/repositories/product.repository.js';

describe('analytics/lead/product repositories', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('analytics repository CRUD/list delegates to prisma', async () => {
    jest.spyOn(prisma.analyticsEvent, 'create').mockResolvedValue({ id: 'a1' });
    jest.spyOn(prisma.analyticsEvent, 'findUnique').mockResolvedValue({ id: 'a1' });
    jest.spyOn(prisma.analyticsEvent, 'update').mockResolvedValue({ id: 'a1', eventType: 'view' });
    jest.spyOn(prisma.analyticsEvent, 'delete').mockResolvedValue({ id: 'a1' });
    jest.spyOn(prisma.analyticsEvent, 'findMany').mockResolvedValue([{ id: 'a1' }]);

    await expect(analyticsRepository.create({ eventType: 'view' })).resolves.toEqual({ id: 'a1' });
    await expect(analyticsRepository.findById('a1')).resolves.toEqual({ id: 'a1' });
    await expect(analyticsRepository.update('a1', { eventType: 'view' })).resolves.toEqual({ id: 'a1', eventType: 'view' });
    await expect(analyticsRepository.delete('a1')).resolves.toEqual({ id: 'a1' });
    await expect(analyticsRepository.list()).resolves.toEqual([{ id: 'a1' }]);
  });

  test('lead repository CRUD/list delegates to prisma', async () => {
    jest.spyOn(prisma.lead, 'create').mockResolvedValue({ id: 'l1' });
    jest.spyOn(prisma.lead, 'findUnique').mockResolvedValue({ id: 'l1' });
    jest.spyOn(prisma.lead, 'update').mockResolvedValue({ id: 'l1', name: 'Lead' });
    jest.spyOn(prisma.lead, 'delete').mockResolvedValue({ id: 'l1' });
    jest.spyOn(prisma.lead, 'findMany').mockResolvedValue([{ id: 'l1' }]);

    await expect(leadRepository.create({ name: 'Lead' })).resolves.toEqual({ id: 'l1' });
    await expect(leadRepository.findById('l1')).resolves.toEqual({ id: 'l1' });
    await expect(leadRepository.update('l1', { name: 'Lead' })).resolves.toEqual({ id: 'l1', name: 'Lead' });
    await expect(leadRepository.delete('l1')).resolves.toEqual({ id: 'l1' });
    await expect(leadRepository.list()).resolves.toEqual([{ id: 'l1' }]);
  });

  test('product repository CRUD/list delegates to prisma', async () => {
    jest.spyOn(prisma.product, 'create').mockResolvedValue({ id: 'p1' });
    jest.spyOn(prisma.product, 'findUnique').mockResolvedValue({ id: 'p1' });
    jest.spyOn(prisma.product, 'update').mockResolvedValue({ id: 'p1', stock: 4 });
    jest.spyOn(prisma.product, 'delete').mockResolvedValue({ id: 'p1' });
    jest.spyOn(prisma.product, 'findMany').mockResolvedValue([{ id: 'p1' }]);

    await expect(productRepository.create({ name: 'P' })).resolves.toEqual({ id: 'p1' });
    await expect(productRepository.findById('p1')).resolves.toEqual({ id: 'p1' });
    await expect(productRepository.update('p1', { stock: 4 })).resolves.toEqual({ id: 'p1', stock: 4 });
    await expect(productRepository.delete('p1')).resolves.toEqual({ id: 'p1' });
    await expect(productRepository.list()).resolves.toEqual([{ id: 'p1' }]);
  });

  test('repositories normalize prisma errors', async () => {
    jest.spyOn(prisma.analyticsEvent, 'create').mockRejectedValue({ code: 'P2002', message: 'dup' });
    jest.spyOn(prisma.lead, 'findUnique').mockRejectedValue({ code: 'P2025', message: 'missing' });
    jest.spyOn(prisma.product, 'delete').mockRejectedValue(new Error('boom'));

    await expect(analyticsRepository.create({})).rejects.toMatchObject({ statusCode: 409, code: 'DB_UNIQUE_CONSTRAINT' });
    await expect(leadRepository.findById('x')).rejects.toMatchObject({ statusCode: 404, code: 'DB_RECORD_NOT_FOUND' });
    await expect(productRepository.delete('x')).rejects.toMatchObject({ statusCode: 500, code: 'DB_OPERATION_FAILED' });
  });
});