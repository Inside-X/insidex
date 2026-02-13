import { z } from 'zod';
import { checkoutCustomerSchema, checkoutItemSchema } from './checkout.schema.js';

const uuidSchema = z.string().uuid('id must be a valid UUID');

export const ordersSchemas = {
  create: z.object({
    userId: uuidSchema.optional(),
    idempotencyKey: z.string().min(10).max(128),
    stripePaymentIntentId: z.string().max(255).optional(),
    email: checkoutCustomerSchema.shape.email,
    address: checkoutCustomerSchema.shape.address,
    items: z.array(checkoutItemSchema).min(1),
  }).strict({ message: 'unknown field in order payload' }),
  paymentWebhook: z.object({
    provider: z.enum(['stripe', 'paypal']),
    eventId: z.string().min(1).max(255),
    orderId: uuidSchema.optional(),
    stripePaymentIntentId: z.string().min(1).max(255).optional(),
    payload: z.record(z.any()).optional(),
  }).strict({ message: 'unknown field in payment webhook payload' }).refine((value) => value.orderId || value.stripePaymentIntentId, {
    message: 'orderId or stripePaymentIntentId is required',
    path: ['orderId'],
  }),
  byIdParams: z.object({ id: uuidSchema }).strict({ message: 'unknown field in order params payload' }),
};

export default ordersSchemas;