export class AppError extends Error {
  constructor({ message, statusCode = 500, code = 'INTERNAL_ERROR', details = [] }) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(details = [], message = 'Invalid request payload') {
    super({
      message,
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      details
    });
  }
}