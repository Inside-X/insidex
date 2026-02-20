import { jest } from '@jest/globals';

async function loadAnalyticsRepository() {
  jest.resetModules();

  const prismaMock = {
    analyticsEvent: {
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

  const { analyticsRepository } = await import('../../src/repositories/analytics.repository.js');
  return { analyticsRepository, prismaMock, normalizeDbError };
}

describe('analyticsRepository', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  test.each([
    ['create', ['analyticsEvent', 'create'], [{ type: 'click' }], { id: 'a1' }, { data: { type: 'click' } }],
    ['findById', ['analyticsEvent', 'findUnique'], ['a1'], { id: 'a1' }, { where: { id: 'a1' } }],
    ['update', ['analyticsEvent', 'update'], ['a1', { type: 'view' }], { id: 'a1', type: 'view' }, { where: { id: 'a1' }, data: { type: 'view' } }],
    ['delete', ['analyticsEvent', 'delete'], ['a1'], { id: 'a1' }, { where: { id: 'a1' } }],
  ])('%s success path', async (method, [model, op], args, expectedResult, expectedCall) => {
    const { analyticsRepository, prismaMock, normalizeDbError } = await loadAnalyticsRepository();
    prismaMock[model][op].mockResolvedValueOnce(expectedResult);

    await expect(analyticsRepository[method](...args)).resolves.toEqual(expectedResult);
    expect(prismaMock[model][op]).toHaveBeenCalledWith(expectedCall);
    expect(normalizeDbError).not.toHaveBeenCalled();
  });

  test.each([
    ['create', [{ type: 'click' }], 'create'],
    ['findById', ['a1'], 'findById'],
    ['update', ['a1', { type: 'view' }], 'update'],
    ['delete', ['a1'], 'delete'],
  ])('%s failure path normalizes db error', async (method, args, operation) => {
    const { analyticsRepository, prismaMock, normalizeDbError } = await loadAnalyticsRepository();
    const dbError = new Error(`${method} failed`);
    prismaMock.analyticsEvent[method === 'findById' ? 'findUnique' : method].mockRejectedValueOnce(dbError);

    await expect(analyticsRepository[method](...args)).rejects.toThrow(dbError);
    expect(normalizeDbError).toHaveBeenCalledWith(dbError, { repository: 'analytics', operation });
  });

  test('list uses defaults when params are omitted', async () => {
    const { analyticsRepository, prismaMock } = await loadAnalyticsRepository();
    prismaMock.analyticsEvent.findMany.mockResolvedValueOnce([{ id: 'a2' }]);

    await expect(analyticsRepository.list()).resolves.toEqual([{ id: 'a2' }]);
    expect(prismaMock.analyticsEvent.findMany).toHaveBeenCalledWith({
      skip: 0,
      take: 100,
      where: {},
      orderBy: { createdAt: 'desc' },
    });
  });

  test('list uses provided pagination/filter/order params including edge values', async () => {
    const { analyticsRepository, prismaMock } = await loadAnalyticsRepository();
    const params = { skip: 999, take: 0, where: { type: 'x' }, orderBy: { createdAt: 'asc' } };
    prismaMock.analyticsEvent.findMany.mockResolvedValueOnce([]);

    await expect(analyticsRepository.list(params)).resolves.toEqual([]);
    expect(prismaMock.analyticsEvent.findMany).toHaveBeenCalledWith(params);
  });

  test('list failure path normalizes db error', async () => {
    const { analyticsRepository, prismaMock, normalizeDbError } = await loadAnalyticsRepository();
    const dbError = Object.assign(new Error('network connection lost'), { code: 'ECONNRESET' });
    prismaMock.analyticsEvent.findMany.mockRejectedValueOnce(dbError);

    await expect(analyticsRepository.list({ where: { userId: 'u1' } })).rejects.toThrow(dbError);
    expect(normalizeDbError).toHaveBeenCalledWith(dbError, { repository: 'analytics', operation: 'list' });
  });
});