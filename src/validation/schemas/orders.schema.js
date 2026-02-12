import { z } from 'zod';

const uuidSchema = z.string().uuid('id must be a valid UUID');

export const ordersSchemas = {
  create: z.object({
    userId: uuidSchema,
    items: z.array(z.object({
      productId: uuidSchema,
      quantity: z.number().int().min(1).max(100),
    }).strict()).min(1),
  }).strict({ message: 'unknown field in order payload' }),
  byIdParams: z.object({ id: uuidSchema }).strict({ message: 'unknown field in order params payload' }),
};

export default ordersSchemas;