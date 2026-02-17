import { z } from 'zod';
import { checkoutCustomerSchema, checkoutItemSchema } from './checkout.schema.js';

const uuidSchema = z.string().uuid('id must be a valid UUID');

export const paymentsSchemas = {
  createIntent: z.object({
    idempotencyKey: z.string().min(10).max(128),
    email: checkoutCustomerSchema.shape.email,
    address: checkoutCustomerSchema.shape.address,
    items: z.array(checkoutItemSchema).min(1),
    currency: z.string().trim().length(3).default('EUR'),
  }).strict({ message: 'unknown field in payment intent payload' }),

  stripeWebhook: z.object({
    id: z.string().min(1),
    type: z.string().min(1),
    data: z.object({
      object: z.object({
        id: z.string().min(1),
        status: z.string().min(1),
        amount_received: z.number().int().nonnegative(),
        currency: z.string().min(3).max(3),
        metadata: z.object({
          orderId: uuidSchema,
          userId: uuidSchema,
          idempotencyKey: z.string().min(10).max(128),
        }).strict(),
      }).strict(),
    }).strict(),
  }).strict({ message: 'unknown field in stripe webhook payload' }),

  paypalWebhook: z.object({
    eventId: z.string().min(1).max(255),
    orderId: uuidSchema,
    metadata: z.object({
      orderId: uuidSchema,
      userId: uuidSchema,
      idempotencyKey: z.string().min(10).max(128),
    }).strict(),
    payload: z.record(z.any()).optional(),
  }).strict({ message: 'unknown field in paypal webhook payload' }),
};

export default paymentsSchemas;