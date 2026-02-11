import { ZodError } from 'zod';
import { ValidationError } from '../errors/app-error.js';

const ALLOWED_PROPERTIES = new Set(['body', 'query', 'params']);

function formatIssues(issues = []) {
  return issues.map((issue) => ({
    path: issue.path?.join('.') || '',
    message: issue.message,
    code: issue.code,
    ...(issue.expected !== undefined ? { expected: issue.expected } : {}),
    ...(issue.received !== undefined ? { received: issue.received } : {})
  }));
}

export function validate(schema, property = 'body') {
  if (!ALLOWED_PROPERTIES.has(property)) {
    throw new Error(`validate middleware received invalid property: ${property}`);
  }

  return (req, _res, next) => {
    try {
      const parsed = schema.parse(req[property]);
      req[property] = parsed;
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        return next(new ValidationError(formatIssues(error.issues)));
      }
      return next(error);
    }
  };
}