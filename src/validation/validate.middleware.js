import { ZodError } from 'zod';
import { ValidationError } from '../errors/validation-error.js';

const ALLOWED_PROPERTIES = new Set(['body', 'query', 'params']);

export function validate(schema, property = 'body') {
  if (!ALLOWED_PROPERTIES.has(property)) {
    throw new Error(`validate middleware received invalid property: ${property}`);
  }

  return (req, _res, next) => {
    try {
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