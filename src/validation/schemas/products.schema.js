import { z } from 'zod';

export const createProductSchema = z
  .object({
    // Bornes courtes pour prévenir les entrées volumineuses et rester SQL-friendly.
    name: z.string({ required_error: 'name is required' })
      .trim()
      .min(3, 'name must contain at least 3 characters')
      .max(150, 'name must contain at most 150 characters'),
    description: z.string({ required_error: 'description is required' })
      .trim()
      .max(2000, 'description must contain at most 2000 characters'),
    price: z.number({ required_error: 'price is required', invalid_type_error: 'price must be a number' })
      .positive('price must be greater than 0'),
    stock: z.number({ required_error: 'stock is required', invalid_type_error: 'stock must be an integer' })
      .int('stock must be an integer')
      .min(0, 'stock must be greater than or equal to 0'),
    active: z.boolean({ invalid_type_error: 'active must be a boolean' }).default(true)
  })
  .strict({ message: 'unknown field in product payload' });

const booleanFromString = z.enum(['true', 'false']).transform((value) => value === 'true');

export const productsSchemas = {
  create: createProductSchema,
  listQuery: z.object({
    slug: z.string().trim().min(1).max(180).optional(),
    category: z.string().trim().min(1).max(80).optional(),
    published: booleanFromString.optional(),
    featured: booleanFromString.optional(),
    minPrice: z.coerce.number().min(0).optional(),
    maxPrice: z.coerce.number().min(0).optional(),
    q: z.string().trim().min(1).max(120).optional()
  }).strict({ message: 'unknown field in products query payload' }),
  byIdParams: z.object({ id: z.string().trim().min(1).max(128) }).strict({ message: 'unknown field in product params payload' })
};