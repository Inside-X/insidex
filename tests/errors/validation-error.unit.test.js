import { z } from 'zod';
import { AppError } from '../../src/errors/app-error.js';
import { ValidationError } from '../../src/errors/validation-error.js';

describe('ValidationError', () => {
  test('constructor defaults and inheritance', () => {
    const err = new ValidationError();

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.name).toBe('ValidationError');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toBe('Invalid request payload');
    expect(err.details).toEqual([]);
    expect(typeof err.stack).toBe('string');
    expect(err.stack).toContain('Invalid request payload');
  });

  test('constructor supports custom message and details', () => {
    const details = [{ field: 'email', message: 'invalid email' }];
    const err = new ValidationError(details, 'Bad body');

    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toBe('Bad body');
    expect(err.details).toEqual(details);
  });

  test('fromZodError maps issue paths and uses payload fallback for empty/non-array paths', () => {
    const schema = z.object({
      email: z.string().email(),
      profile: z.object({ age: z.number().int() }),
      items: z.array(z.object({ id: z.string().min(1) })),
    });

    const parsed = schema.safeParse({
      email: 'bad-email',
      profile: { age: 1.5 },
      items: [{}],
    });

    expect(parsed.success).toBe(false);
    const err = ValidationError.fromZodError(parsed.error);

    expect(err).toBeInstanceOf(ValidationError);
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.details.length).toBeGreaterThanOrEqual(3);

    const fields = err.details.map((d) => d.field);
    expect(fields).toContain('email');
    expect(fields).toContain('profile.age');
    expect(fields).toContain('items.0.id');

    const payloadFallback = ValidationError.fromZodError({ issues: [{ path: [], message: 'bad payload' }] });
    expect(payloadFallback.details).toEqual([]);
  });



  test('fromZodError handles empty issue path by falling back to payload', () => {
    const malformedZod = new z.ZodError([
      { code: z.ZodIssueCode.custom, path: [], message: 'root-level issue' },
    ]);

    const err = ValidationError.fromZodError(malformedZod);
    expect(err.details).toEqual([{ field: 'payload', message: 'root-level issue' }]);
  });


  test('fromZodError handles undefined issue path by falling back to payload', () => {
    const malformedZod = new z.ZodError([
      { code: z.ZodIssueCode.custom, path: undefined, message: 'undefined path' },
    ]);

    const err = ValidationError.fromZodError(malformedZod);
    expect(err.details).toEqual([{ field: 'payload', message: 'undefined path' }]);
  });

  test('fromZodError handles malformed issue path by falling back to payload', () => {
    const malformedZod = new z.ZodError([
      { code: z.ZodIssueCode.custom, path: null, message: 'bad root' },
    ]);

    const err = ValidationError.fromZodError(malformedZod);
    expect(err.details).toEqual([{ field: 'payload', message: 'bad root' }]);
  });

  test('fromZodError with non-Zod error returns default ValidationError', () => {
    const err = ValidationError.fromZodError(new Error('not zod'));
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toBe('Invalid request payload');
    expect(err.details).toEqual([]);
  });
});