import { logger } from '../utils/logger.js';
import { connectRefreshTokenRedis } from '../lib/refresh-token-redis-client.js';
import { assertRefreshTokenRedisConnected } from '../security/refresh-token-store.js';
import { prisma } from '../lib/prisma.js';

function isProduction(env = process.env) {
  return env.NODE_ENV === 'production';
}

function readErrorMessage(error) {
  if (error instanceof Error && typeof error.message === 'string' && error.message.trim()) {
    return error.message;
  }
  return 'unknown';
}

export async function assertProductionInfrastructureOrExit({
  env = process.env,
  connectRedis = connectRefreshTokenRedis,
  verifyRedis = assertRefreshTokenRedisConnected,
  connectDb = async () => {
    await prisma.$connect();
    if (typeof prisma.$queryRawUnsafe === 'function') {
      await prisma.$queryRawUnsafe('SELECT 1');
    }
  },
  onRedisClient,
  onError = logger.error,
  exit = process.exit,
} = {}) {
  if (!isProduction(env)) {
    return { ok: true };
  }

  try {
    const redisClient = await connectRedis({ env, required: true });
    if (!redisClient) {
      throw new Error('Redis client unavailable');
    }

    if (typeof onRedisClient === 'function') {
      onRedisClient(redisClient);
    }

    await verifyRedis();
    await connectDb();

    return { ok: true };
  } catch (error) {
    const message = readErrorMessage(error);
    onError('boot_infra_unavailable', {
      event: 'boot_infra_unavailable',
      message,
      dependencies: ['redis', 'database', 'jwt', 'stripe', 'paypal'],
    });
    console.error(`[BOOT_FATAL] Infrastructure unavailable: ${message}`);
    exit(1);
    return { ok: false };
  }
}

export default assertProductionInfrastructureOrExit;