import { ZodError } from 'zod';

const ALLOWED_PROPERTIES = new Set(['body', 'query', 'params']);

export function strictValidate(schema, property = 'body') {
  if (!ALLOWED_PROPERTIES.has(property)) {
    throw new Error(`strictValidate middleware received invalid property: ${property}`);
  }

  return (req, res, next) => {
    try {
      req[property] = schema.parse(req[property]);
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request payload',
            requestId: req.requestId,
            details: [],
          },
        });
      }

      return next(error);
    }
  };
}

export default strictValidate;