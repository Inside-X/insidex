import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;

function createPrismaTestDouble() {
  const modelProxy = new Proxy(
    {
      findMany: async () => [],
      findUnique: async () => null,
      findFirst: async () => null,
      create: async (args) => args?.data ?? null,
      update: async (args) => args?.data ?? null,
      delete: async () => null,
      upsert: async (args) => args?.create ?? null,
      createMany: async () => ({ count: 0 }),
      updateMany: async () => ({ count: 0 }),
      deleteMany: async () => ({ count: 0 }),
      count: async () => 0,
    },
    {
      get(target, operation) {
        if (operation === Symbol.toStringTag) {
          return 'PrismaTestDoubleModel';
        }

        if (!(operation in target)) {
          target[operation] = async () => null;
        }

        return target[operation];
      },
    },
  );

  return new Proxy(
    {
      async $disconnect() {
        return undefined;
      },
      async $connect() {
        return undefined;
      },
      async $transaction(input) {
        if (typeof input === 'function') {
          return input(modelProxy);
        }
        if (Array.isArray(input)) {
          return Promise.all(input);
        }
        return input;
      },
    },
    {
      get(target, property) {
        if (property in target) {
          return target[property];
        }

        if (property === Symbol.toStringTag) {
          return 'PrismaTestDouble';
        }

        return modelProxy;
      },
    },
  );
}

const shouldDisableDb = process.env.NODE_ENV === 'test' && process.env.PRISMA_DISABLE_DB === '1';

export const prisma =
  globalForPrisma.prisma ||
  (shouldDisableDb
    ? createPrismaTestDouble()
    : new PrismaClient({
      log: ['error', 'warn'],
    }));

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;