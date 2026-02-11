export class AppError extends Error {
  constructor({
    statusCode = 500,
    code = 'INTERNAL_ERROR',
    message = 'Internal server error',
    details = []
  } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = Array.isArray(details) ? details : [];
  }
}

export class AuthError extends AppError {
  constructor(message = 'Authentication required', details = []) {
    super({ statusCode: 401, code: 'AUTH_ERROR', message, details });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', details = []) {
    super({ statusCode: 403, code: 'FORBIDDEN', message, details });
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details = []) {
    super({ statusCode: 404, code: 'NOT_FOUND', message, details });
  }
}

export class InternalError extends AppError {
  constructor(message = 'Internal server error', details = []) {
    super({ statusCode: 500, code: 'INTERNAL_ERROR', message, details });
  }
}