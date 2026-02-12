import { ZodError } from 'zod';
import { ValidationError } from '../errors/validation-error.js';

const ALLOWED_PROPERTIES = new Set(['body', 'query', 'params']);

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validate(schema, property = 'body') {
  if (!ALLOWED_PROPERTIES.has(property)) {
    throw new Error(`validate middleware received invalid property: ${property}`);
  }

  return (req, _res, next) => {
    try {
      if (property === 'body') {
        const hasPayload = Number(req.get('content-length') || 0) > 0;
        if (hasPayload && !req.is('application/json')) {
          return next(new ValidationError([{ field: 'payload', message: 'Content-Type must be application/json' }]));
        }

        if (!isPlainObject(req.body)) {
          return next(new ValidationError([{ field: 'payload', message: 'request body must be a JSON object' }]));
        }
      }
      
      req[property] = schema.parse(req[property]);
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        return next(ValidationError.fromZodError(error));
      }
      return next(error);
    }
  };
}