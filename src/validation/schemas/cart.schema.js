import { z } from 'zod';
import { identifierSchema, optionalUserScopeSchema } from './common.schema.js';

const itemIdParamSchema = z
  .object({
    id: identifierSchema
  })
  .strip();

export const cartSchemas = {
  getCartQuery: optionalUserScopeSchema,

  addItem: z
    .object({
      id: identifierSchema,
      name: z.string().trim().min(1).max(180),
      price: z.coerce.number().finite().min(0).max(1000000),
      qty: z.coerce.number().int().min(1).max(999).optional(),
      userId: identifierSchema.optional(),
      anonId: identifierSchema.optional()
    })
    .strip()
    .superRefine((value, ctx) => {
      if (!value.userId && !value.anonId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Either userId or anonId is required',
          path: ['userId']
        });
      }
    }),

  updateItemParams: itemIdParamSchema,
  updateItemBody: z
    .object({
      qty: z.coerce.number().int().min(1).max(999),
      userId: identifierSchema.optional(),
      anonId: identifierSchema.optional()
    })
    .strip()
    .superRefine((value, ctx) => {
      if (!value.userId && !value.anonId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Either userId or anonId is required',
          path: ['userId']
        });
      }
    }),

  removeItemParams: itemIdParamSchema,
  removeItemBody: optionalUserScopeSchema,
  clearCartBody: optionalUserScopeSchema,

  sync: z
    .object({
      anonId: identifierSchema,
      userId: identifierSchema
    })
    .strip()
};