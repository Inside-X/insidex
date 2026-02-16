import { z } from 'zod';

export const analyticsSchemas = {
  track: z.object({
    eventType: z.string().trim().min(1).max(100),
    payload: z.record(z.any()).default({}),
  }).strict({ message: 'unknown field in analytics payload' }),
  listQuery: z.object({
    eventType: z.string().trim().min(1).max(100).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }).strict({ message: 'unknown field in analytics query payload' }),
};

export default analyticsSchemas;