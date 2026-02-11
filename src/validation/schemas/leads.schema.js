import { z } from 'zod';

export const createLeadSchema = z
  .object({
    // Champs textuels bornés pour limiter les payloads et faciliter stockage SQL.
    name: z.string({ required_error: 'name is required' })
      .trim()
      .min(2, 'name must contain at least 2 characters')
      .max(120, 'name must contain at most 120 characters'),
    email: z.string({ required_error: 'email is required' })
      .trim()
      .toLowerCase()
      .email('email must be a valid email address')
      .max(255, 'email must contain at most 255 characters'),
    message: z.string({ required_error: 'message is required' })
      .trim()
      .min(10, 'message must contain at least 10 characters')
      .max(2000, 'message must contain at most 2000 characters')
  })
  .strict({ message: 'unknown field in lead payload' });

export const leadsSchemas = {
  create: createLeadSchema,
  listQuery: z.object({
    page: z.coerce.number().int().min(1).max(1000).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional()
  }).strict({ message: 'unknown field in leads query payload' })
};