import { z } from 'zod';
import { checkoutCustomerSchema, checkoutItemSchema } from './checkout.schema.js';
import { boundedSecondaryPayloadSchema } from './common.schema.js';

const uuidSchema = z.string().uuid('id must be a valid UUID');
const fulfillmentModeSchema = z.enum(['pickup_local', 'delivery_local']);

const deliveryDestinationSchema = checkoutCustomerSchema.shape.address;

const fulfillmentSchema = z.object({
  mode: fulfillmentModeSchema,
  pickup: z.object({
    note: z.string().trim().max(500).optional(),
  }).strict({ message: 'unknown field in pickup fulfillment payload' }).optional(),
  delivery: z.object({
    destination: deliveryDestinationSchema,
    note: z.string().trim().max(500).optional(),
  }).strict({ message: 'unknown field in delivery fulfillment payload' }).optional(),
}).strict({ message: 'unknown field in fulfillment payload' });

export const ordersSchemas = {
  create: z.object({
    idempotencyKey: z.string().min(10).max(128),
    stripePaymentIntentId: z.string().max(255).optional(),
    email: checkoutCustomerSchema.shape.email,
    address: checkoutCustomerSchema.shape.address.optional(),
    fulfillment: fulfillmentSchema.optional().default({ mode: 'pickup_local' }),
    items: z.array(checkoutItemSchema).min(1),
  }).strict({ message: 'unknown field in order payload' }).superRefine((value, ctx) => {
    if (value.fulfillment.mode === 'pickup_local') {
      if (value.fulfillment.delivery) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'delivery payload is forbidden for pickup_local mode',
          path: ['fulfillment', 'delivery'],
        });
      }
      return;
    }

    if (value.fulfillment.mode === 'delivery_local') {
      if (value.fulfillment.pickup) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'pickup payload is forbidden for delivery_local mode',
          path: ['fulfillment', 'pickup'],
        });
      }

      const hasDestination = Boolean(value.fulfillment.delivery?.destination || value.address);
      if (!hasDestination) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'delivery_local requires destination truth',
          path: ['fulfillment', 'delivery', 'destination'],
        });
      }
    }
  }),
  paymentWebhook: z.object({
    provider: z.enum(['stripe', 'paypal']),
    eventId: z.string().min(1).max(255),
    orderId: uuidSchema.optional(),
    stripePaymentIntentId: z.string().min(1).max(255).optional(),
    payload: boundedSecondaryPayloadSchema.optional(),
  }).strict({ message: 'unknown field in payment webhook payload' }).refine((value) => value.orderId || value.stripePaymentIntentId, {
    message: 'orderId or stripePaymentIntentId is required',
    path: ['orderId'],
  }),
  byIdParams: z.object({ id: uuidSchema }).strict({ message: 'unknown field in order params payload' }),
};

export default ordersSchemas;
