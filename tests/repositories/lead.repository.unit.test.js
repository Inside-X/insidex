import { jest } from '@jest/globals';

async function loadLeadRepository() {
  jest.resetModules();

  const prismaMock = {
    lead: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const normalizeDbError = jest.fn((error) => {
    throw error;
  });

  await jest.unstable_mockModule('../../src/lib/prisma.js', () => ({ default: prismaMock }));
  await jest.unstable_mockModule('../../src/lib/db-error.js', () => ({ normalizeDbError }));

  const { leadRepository } = await import('../../src/repositories/lead.repository.js');
  return { leadRepository, prismaMock, normalizeDbError };
}

describe('leadRepository', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test.each([
    ['create', 'create', [{ email: 'l@test.dev' }], { data: { email: 'l@test.dev' } }, { id: 'l1' }],
    ['findById', 'findUnique', ['l1'], { where: { id: 'l1' } }, { id: 'l1' }],
    ['update', 'update', ['l1', { source: 'ad' }], { where: { id: 'l1' }, data: { source: 'ad' } }, { id: 'l1', source: 'ad' }],
    ['delete', 'delete', ['l1'], { where: { id: 'l1' } }, { id: 'l1' }],
  ])('%s success path', async (method, op, args, expectedCall, expectedResult) => {
    const { leadRepository, prismaMock } = await loadLeadRepository();
    prismaMock.lead[op].mockResolvedValueOnce(expectedResult);

    await expect(leadRepository[method](...args)).resolves.toEqual(expectedResult);
    expect(prismaMock.lead[op]).toHaveBeenCalledWith(expectedCall);
  });

  test.each([
    ['create', 'create', [{ email: 'x' }], 'create'],
    ['findById', 'findUnique', ['l1'], 'findById'],
    ['update', 'update', ['l1', { source: 'z' }], 'update'],
    ['delete', 'delete', ['l1'], 'delete'],
    ['list', 'findMany', [{ where: { source: 'ads' } }], 'list'],
  ])('%s failure path', async (method, op, args, operation) => {
    const { leadRepository, prismaMock, normalizeDbError } = await loadLeadRepository();
    const dbError = Object.assign(new Error(`${operation} err`), { code: 'P2034' });
    prismaMock.lead[op].mockRejectedValueOnce(dbError);

    await expect(leadRepository[method](...args)).rejects.toThrow(dbError);
    expect(normalizeDbError).toHaveBeenCalledWith(dbError, { repository: 'lead', operation });
  });

  test('list with defaults', async () => {
    const { leadRepository, prismaMock } = await loadLeadRepository();
    prismaMock.lead.findMany.mockResolvedValueOnce([{ id: 'l3' }]);

    await expect(leadRepository.list()).resolves.toEqual([{ id: 'l3' }]);
    expect(prismaMock.lead.findMany).toHaveBeenCalledWith({
      skip: 0,
      take: 50,
      where: {},
      orderBy: { createdAt: 'desc' },
    });
  });

  test('list with explicit filters', async () => {
    const { leadRepository, prismaMock } = await loadLeadRepository();
    const params = { skip: 5, take: 500, where: { source: 'social' }, orderBy: { createdAt: 'asc' } };
    prismaMock.lead.findMany.mockResolvedValueOnce([]);

    await expect(leadRepository.list(params)).resolves.toEqual([]);
    expect(prismaMock.lead.findMany).toHaveBeenCalledWith(params);
  });
});