import { logger } from '../utils/logger.js';

function logDbError(level, error, context) {
  logger[level]('db_error', {
    message: error?.message,
    code: error?.code,
    meta: error?.meta,
    context,
  });
}

export function normalizeDbError(error, context = {}) {
  if (typeof error?.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500) {
    logDbError('warn', error, context);
    throw error;
  }
  
  if (error?.code === 'P2002') {
    logDbError('warn', error, context);

    const conflict = new Error('Database unique constraint violation');
    conflict.statusCode = 409;
    conflict.code = 'DB_UNIQUE_CONSTRAINT';
    throw conflict;
  }

  if (error?.code === 'P2025') {
    logDbError('warn', error, context);

    const notFound = new Error('Database record not found');
    notFound.statusCode = 404;
    notFound.code = 'DB_RECORD_NOT_FOUND';
    throw notFound;
  }

  logDbError('error', error, context);
  
  const generic = new Error('Database operation failed');
  generic.statusCode = 500;
  generic.code = 'DB_OPERATION_FAILED';
  throw generic;
}