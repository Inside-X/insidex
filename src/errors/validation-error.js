import { ZodError } from 'zod';
import { AppError } from './app-error.js';

function toField(path = []) {
  if (!Array.isArray(path) || path.length === 0) {
    return 'payload';
  }
  return path.join('.');
}

export class ValidationError extends AppError {
  constructor(details = [], message = 'Invalid request payload') {
    super({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message,
      details
    });
  }

  static fromZodError(error) {
    if (!(error instanceof ZodError)) {
      return new ValidationError();
    }

    const details = error.issues.map((issue) => ({
      field: toField(issue.path),
      message: issue.message
    }));

    return new ValidationError(details);
  }
}