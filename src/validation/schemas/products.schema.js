import { z } from 'zod';
import { identifierSchema, paginationQuerySchema } from './common.schema.js';

const booleanFromString = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

export const productsSchemas = {
  listQuery: paginationQuerySchema
    .extend({
      slug: z.string().trim().min(1).max(180).optional(),
      category: z.string().trim().min(1).max(80).optional(),
      published: booleanFromString.optional(),
      featured: booleanFromString.optional(),
      minPrice: z.coerce.number().finite().min(0).max(1000000).optional(),
      maxPrice: z.coerce.number().finite().min(0).max(1000000).optional(),
      q: z.string().trim().min(1).max(120).optional()
    })
    .strip()
    .superRefine((value, ctx) => {
      if (
        value.minPrice !== undefined
        && value.maxPrice !== undefined
        && value.minPrice > value.maxPrice
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'minPrice must be less than or equal to maxPrice',
          path: ['minPrice']
        });
      }
    }),

  byIdParams: z
    .object({
      id: identifierSchema
    })
    .strip()
};