export function normalizeDbError(error, context = {}) {
  const payload = {
    message: error?.message,
    code: error?.code,
    meta: error?.meta,
    context,
  };

  console.error('[DB_ERROR]', JSON.stringify(payload));

  if (error?.code === 'P2002') {
    const conflict = new Error('Database unique constraint violation');
    conflict.statusCode = 409;
    conflict.code = 'DB_UNIQUE_CONSTRAINT';
    throw conflict;
  }

  if (error?.code === 'P2025') {
    const notFound = new Error('Database record not found');
    notFound.statusCode = 404;
    notFound.code = 'DB_RECORD_NOT_FOUND';
    throw notFound;
  }

  const generic = new Error('Database operation failed');
  generic.statusCode = 500;
  generic.code = 'DB_OPERATION_FAILED';
  throw generic;
}