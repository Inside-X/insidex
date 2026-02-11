import { z } from 'zod';

export const identifierSchema = z.string().trim().min(1).max(128);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(254);

export const passwordSchema = z.string().min(8).max(128);

export const optionalUserScopeSchema = z
  .object({
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
  });

export const paginationQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(1000).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    sortBy: z.string().trim().min(1).max(64).optional(),
    order: z.enum(['asc', 'desc']).optional()
  })
  .strip();