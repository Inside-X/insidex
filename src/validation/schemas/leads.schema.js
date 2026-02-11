import { z } from 'zod';
import { emailSchema, paginationQuerySchema } from './common.schema.js';

export const leadsSchemas = {
  listQuery: paginationQuerySchema,

  create: z
    .object({
      email: emailSchema,
      source: z.string().trim().min(1).max(80).optional()
    })
    .strip()
};