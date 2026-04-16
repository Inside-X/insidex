import { z } from 'zod';

const uuidSchema = z.string().uuid('id must be a valid UUID');
const trimmedRequiredString = (fieldName) => z.string({ required_error: `${fieldName} is required` }).trim().min(1, `${fieldName} is required`);
const canonicalSlugSchema = z.string({ required_error: 'slug is required' }).trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be a normalized lowercase slug');
const canonicalPriceSchema = z.string({ required_error: 'price is required' }).regex(/^\d+\.\d{2}$/, 'price must be a canonical decimal string');
const eurCurrencySchema = z.literal('EUR', { errorMap: () => ({ message: 'currency must be EUR' }) });
const nonNegativeIntegerSchema = z.number({ required_error: 'stock is required', invalid_type_error: 'stock must be a non-negative integer' })
  .int('stock must be a non-negative integer')
  .min(0, 'stock must be a non-negative integer');
const productStatusSchema = z.enum(['draft', 'published']);
const stockAdjustmentIntentClassSchema = z.enum([
  'RECOUNT_CORRECTION',
  'DAMAGE_LOSS_CORRECTION',
  'AUTHORIZED_RESTORATION',
]);

const mediaItemSchema = z.object({
  id: trimmedRequiredString('id'),
  url: z.string({ required_error: 'url is required' }).url('url must be a valid absolute URL'),
  alt: trimmedRequiredString('alt'),
  sortOrder: z.number({ required_error: 'sortOrder is required', invalid_type_error: 'sortOrder must be a non-negative integer' })
    .int('sortOrder must be a non-negative integer')
    .min(0, 'sortOrder must be a non-negative integer'),
  isPrimary: z.boolean({ required_error: 'isPrimary is required', invalid_type_error: 'isPrimary must be a boolean' }),
  kind: z.literal('image', { errorMap: () => ({ message: 'kind must be image' }) }),
}).strict({ message: 'unknown field in product media item payload' });

const enforceMediaInvariants = (items, ctx) => {
  const seenIds = new Map();
  const seenSortOrders = new Map();
  let primaryCount = 0;

  items.forEach((item, index) => {
    if (seenIds.has(item.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['media', index, 'id'],
        message: 'duplicate media id is not allowed',
      });
    } else {
      seenIds.set(item.id, index);
    }

    if (seenSortOrders.has(item.sortOrder)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['media', index, 'sortOrder'],
        message: 'duplicate sortOrder is not allowed',
      });
    } else {
      seenSortOrders.set(item.sortOrder, index);
    }

    if (item.isPrimary) {
      primaryCount += 1;
    }
  });

  if (primaryCount > 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['media'],
      message: 'at most one primary media item is allowed',
    });
  }
};

const mediaListSchema = z.array(mediaItemSchema).superRefine(enforceMediaInvariants);
const emptyBodySchema = z.object({}).strict({ message: 'unknown field in admin product publish payload' });

const createShape = {
  name: trimmedRequiredString('name'),
  slug: canonicalSlugSchema,
  shortDescription: z.string().trim().min(1, 'shortDescription must not be empty').optional(),
  description: trimmedRequiredString('description'),
  price: canonicalPriceSchema,
  currency: eurCurrencySchema,
  stock: nonNegativeIntegerSchema,
  status: productStatusSchema.optional(),
  media: mediaListSchema.optional(),
};

const updateShape = {
  name: trimmedRequiredString('name').optional(),
  slug: canonicalSlugSchema.optional(),
  shortDescription: z.string().trim().min(1, 'shortDescription must not be empty').optional(),
  description: trimmedRequiredString('description').optional(),
  price: canonicalPriceSchema.optional(),
  currency: eurCurrencySchema.optional(),
  stock: nonNegativeIntegerSchema.optional(),
  status: productStatusSchema.optional(),
};

export const adminProductsSchemas = {
  create: z.object(createShape).strict({ message: 'unknown field in admin product payload' }),
  update: z.object(updateShape).strict({ message: 'unknown field in admin product payload' }).refine(
    (payload) => Object.keys(payload).length > 0,
    { message: 'at least one field is required' },
  ),
  publish: emptyBodySchema,
  unpublish: emptyBodySchema,
  replaceMedia: z.object({ media: mediaListSchema }).strict({ message: 'unknown field in admin product media payload' }),
  byIdParams: z.object({ id: uuidSchema }).strict({ message: 'unknown field in admin product params payload' }),
  adjustStock: z.object({
    target: z.union([
      z.object({ productId: uuidSchema }).strict({ message: 'target must contain only productId or sku' }),
      z.object({ sku: trimmedRequiredString('sku').max(120, 'sku must be 120 characters or fewer') }).strict({ message: 'target must contain only productId or sku' }),
    ]),
    intentClass: stockAdjustmentIntentClassSchema,
    quantityDelta: z.number({ required_error: 'quantityDelta is required', invalid_type_error: 'quantityDelta must be a non-zero integer' })
      .int('quantityDelta must be a non-zero integer')
      .refine((value) => value !== 0, 'quantityDelta must be a non-zero integer'),
    expectedStock: z.number({ required_error: 'expectedStock is required', invalid_type_error: 'expectedStock must be a non-negative integer' })
      .int('expectedStock must be a non-negative integer')
      .min(0, 'expectedStock must be a non-negative integer'),
    evidenceRef: z.string().trim().min(1, 'evidenceRef must not be empty').max(120, 'evidenceRef must be 120 characters or fewer').optional(),
    note: z.string().trim().min(1, 'note must not be empty').max(500, 'note must be 500 characters or fewer').optional(),
  }).strict({ message: 'unknown field in admin stock adjustment payload' }),
};

export default adminProductsSchemas;
