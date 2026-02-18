import { jest } from '@jest/globals';

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  process.env = { ...ORIGINAL_ENV };
}

async function importPrismaModule({ env = {}, existingGlobalPrisma = undefined, prismaClientFactory } = {}) {
  jest.resetModules();
  restoreEnv();
  Object.assign(process.env, env);

  if (existingGlobalPrisma === undefined) {
    delete globalThis.prisma;
  } else {
    globalThis.prisma = existingGlobalPrisma;
  }

  const PrismaClient = jest.fn(prismaClientFactory || (() => ({
    $connect: jest.fn(async () => undefined),
    $disconnect: jest.fn(async () => undefined),
    user: { findMany: jest.fn(async () => []) },
  })));

  await jest.unstable_mockModule('@prisma/client', () => ({ PrismaClient }));

  const mod = await import('../../src/lib/prisma.js');
  return { ...mod, PrismaClient };
}

describe('src/lib/prisma.js', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    delete globalThis.prisma;
    restoreEnv();
  });

  test('creates PrismaClient with environment-based config when DB is enabled', async () => {
    const connectSpy = jest.fn(async () => undefined);
    const disconnectSpy = jest.fn(async () => undefined);

    const { prisma, PrismaClient } = await importPrismaModule({
      env: { NODE_ENV: 'development', PRISMA_DISABLE_DB: '0' },
      prismaClientFactory: () => ({
        $connect: connectSpy,
        $disconnect: disconnectSpy,
      }),
    });

    expect(PrismaClient).toHaveBeenCalledTimes(1);
    expect(PrismaClient).toHaveBeenCalledWith({ log: ['error', 'warn'] });
    await expect(prisma.$connect()).resolves.toBeUndefined();
    await expect(prisma.$disconnect()).resolves.toBeUndefined();
    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(disconnectSpy).toHaveBeenCalledTimes(1);
    expect(globalThis.prisma).toBe(prisma);
  });

  test('reuses pre-existing global prisma instance and avoids creating a new client', async () => {
    const existing = {
      marker: 'reused',
      $connect: jest.fn(async () => undefined),
      $disconnect: jest.fn(async () => undefined),
    };

    const { prisma, PrismaClient } = await importPrismaModule({
      env: { NODE_ENV: 'development', PRISMA_DISABLE_DB: '0' },
      existingGlobalPrisma: existing,
    });

    expect(prisma).toBe(existing);
    expect(PrismaClient).not.toHaveBeenCalled();
    await prisma.$connect();
    await prisma.$disconnect();
    expect(existing.$connect).toHaveBeenCalledTimes(1);
    expect(existing.$disconnect).toHaveBeenCalledTimes(1);
  });

  test('does not persist prisma to global scope in production', async () => {
    const { prisma, PrismaClient } = await importPrismaModule({
      env: { NODE_ENV: 'production', PRISMA_DISABLE_DB: '0' },
      prismaClientFactory: () => ({
        $connect: jest.fn(async () => undefined),
        $disconnect: jest.fn(async () => undefined),
      }),
    });

    expect(PrismaClient).toHaveBeenCalledTimes(1);
    expect(globalThis.prisma).toBeUndefined();
    await expect(prisma.$connect()).resolves.toBeUndefined();
  });

  test('returns Prisma test double when db is disabled in test env', async () => {
    const { prisma, PrismaClient } = await importPrismaModule({
      env: { NODE_ENV: 'test', PRISMA_DISABLE_DB: '1' },
    });

    expect(PrismaClient).not.toHaveBeenCalled();

    await expect(prisma.$connect()).resolves.toBeUndefined();
    await expect(prisma.$disconnect()).resolves.toBeUndefined();
    await expect(prisma.$transaction([Promise.resolve(1), Promise.resolve(2)])).resolves.toEqual([1, 2]);

    const callbackResult = await prisma.$transaction(async (tx) => {
      const findMany = await tx.findMany();
      const findUnique = await tx.findUnique();
      const findFirst = await tx.findFirst();
      const created = await tx.create({ data: { id: 'o1' } });
      const createdWithoutArgs = await tx.create();
      const updated = await tx.update({ data: { id: 'o2' } });
      const updatedWithoutArgs = await tx.update();
      const deleted = await tx.delete();
      const upserted = await tx.upsert({ create: { id: 'o3' } });
      const upsertedWithoutArgs = await tx.upsert();
      const createdMany = await tx.createMany();
      const updatedMany = await tx.updateMany();
      const deletedMany = await tx.deleteMany();
      const count = await tx.count();
      const unknown = await tx.nonStandardOperation({});
      return {
        findMany, findUnique, findFirst, created, createdWithoutArgs, updated, updatedWithoutArgs, deleted, upserted, upsertedWithoutArgs,
        createdMany, updatedMany, deletedMany, count, unknown,
      };
    });

    expect(callbackResult).toEqual({
      findMany: [],
      findUnique: null,
      findFirst: null,
      created: { id: 'o1' },
      createdWithoutArgs: null,
      updated: { id: 'o2' },
      updatedWithoutArgs: null,
      deleted: null,
      upserted: { id: 'o3' },
      upsertedWithoutArgs: null,
      createdMany: { count: 0 },
      updatedMany: { count: 0 },
      deletedMany: { count: 0 },
      count: 0,
      unknown: null,
    });
    await expect(prisma.$transaction('direct-value')).resolves.toBe('direct-value');
    expect(Object.prototype.toString.call(prisma)).toBe('[object PrismaTestDouble]');
    expect(Object.prototype.toString.call(prisma.user)).toBe('[object PrismaTestDoubleModel]');
  });

  test('propagates connection failure from PrismaClient instance', async () => {
    const connectError = new Error('connect failed');
    const { prisma } = await importPrismaModule({
      env: { NODE_ENV: 'development', PRISMA_DISABLE_DB: '0' },
      prismaClientFactory: () => ({
        $connect: jest.fn(async () => {
          throw connectError;
        }),
        $disconnect: jest.fn(async () => undefined),
      }),
    });

    await expect(prisma.$connect()).rejects.toBe(connectError);
  });

  test('propagates runtime query errors from Prisma model methods', async () => {
    const queryError = Object.assign(new Error('query failed'), { code: 'P2025' });
    const userFindMany = jest.fn(async () => {
      throw queryError;
    });

    const { prisma } = await importPrismaModule({
      env: { NODE_ENV: 'development', PRISMA_DISABLE_DB: '0' },
      prismaClientFactory: () => ({
        $connect: jest.fn(async () => undefined),
        $disconnect: jest.fn(async () => undefined),
        user: {
          findMany: userFindMany,
        },
      }),
    });

    await expect(prisma.user.findMany({ where: { role: 'admin' } })).rejects.toBe(queryError);
    expect(userFindMany).toHaveBeenCalledWith({ where: { role: 'admin' } });
  });

  test('supports shutdown hook behavior by disconnecting gracefully', async () => {
    const disconnectSpy = jest.fn(async () => undefined);
    const { prisma } = await importPrismaModule({
      env: { NODE_ENV: 'development', PRISMA_DISABLE_DB: '0' },
      prismaClientFactory: () => ({
        $connect: jest.fn(async () => undefined),
        $disconnect: disconnectSpy,
      }),
    });

    const shutdown = async () => prisma.$disconnect();
    await expect(shutdown()).resolves.toBeUndefined();
    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });

  test('no retry loop is executed in module (single constructor invocation even after connect failure)', async () => {
    const { prisma, PrismaClient } = await importPrismaModule({
      env: { NODE_ENV: 'development', PRISMA_DISABLE_DB: '0' },
      prismaClientFactory: () => ({
        $connect: jest.fn(async () => {
          throw new Error('first connect failure');
        }),
        $disconnect: jest.fn(async () => undefined),
      }),
    });

    await expect(prisma.$connect()).rejects.toThrow('first connect failure');
    expect(PrismaClient).toHaveBeenCalledTimes(1);
  });
});