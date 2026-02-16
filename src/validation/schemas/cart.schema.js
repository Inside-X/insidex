import { z } from 'zod';

const productIdSchema = z.union([
  z.string().uuid('productId must be a valid UUID'),
  z.string().trim().regex(/^[a-zA-Z0-9_-]{10,128}$/, 'productId must be an alphanumeric identifier between 10 and 128 characters')
]);

const legacyIdentifierSchema = z.string().trim().min(1).max(128);

export const addToCartSchema = z
  .object({
    // UUID privilégié pour clé primaire PostgreSQL, fallback string long pour migration progressive.
    productId: productIdSchema,
    // Entier borné pour éviter les abus de stock/panier.
    quantity: z.number({ required_error: 'quantity is required', invalid_type_error: 'quantity must be an integer' })
      .int('quantity must be an integer')
      .min(1, 'quantity must be at least 1')
      .max(100, 'quantity must be at most 100')
  })
  .strict({ message: 'unknown field in cart payload' });

const anonScopeSchema = z.object({
  anonId: legacyIdentifierSchema.optional()
}).strict({ message: 'unknown field in cart scope payload' });

export const cartSchemas = {
  // Nouveau endpoint cible.
  add: addToCartSchema,
  // Endpoints existants maintenus.
  getCartQuery: anonScopeSchema,
  addItem: z.object({
    id: legacyIdentifierSchema,
    name: z.string().trim().min(1).max(180),
    price: z.number().min(0),
    qty: z.number().int().min(1).max(999).optional(),
    anonId: legacyIdentifierSchema.optional()
  }).strict({ message: 'unknown field in cart add item payload' }),
  updateItemParams: z.object({ id: legacyIdentifierSchema }).strict({ message: 'unknown field in cart params payload' }),
  updateItemBody: z.object({
    qty: z.number().int().min(1).max(999),
    anonId: legacyIdentifierSchema.optional()
  }).strict({ message: 'unknown field in cart update payload' }),
  removeItemParams: z.object({ id: legacyIdentifierSchema }).strict({ message: 'unknown field in cart params payload' }),
  removeItemBody: anonScopeSchema,
  clearCartBody: anonScopeSchema,
  sync: z.object({
    anonId: legacyIdentifierSchema
  }).strict({ message: 'unknown field in cart sync payload' })
};