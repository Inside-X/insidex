import prisma from './prisma.js';

const TRANSIENT_CODES = new Set(['DB_OPERATION_FAILED', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN']);

export function isDependencyUnavailableError(error) {
  if (TRANSIENT_CODES.has(error?.code)) return true;
  return error?.statusCode === 502 || error?.statusCode === 503;
}

export async function assertDatabaseReady() {
  await prisma.$transaction(async () => true);
}

export function getDependencyReasonCode(dependency, error) {
  if (dependency === 'db') return 'db_unavailable';
  if (dependency === 'redis') return 'redis_unavailable';
  if (dependency === 'provider_timeout') return 'provider_timeout';
  return 'dependency_unknown';
}
