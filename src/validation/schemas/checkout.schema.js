import { z } from 'zod';

export const checkoutItemSchema = z.object({
  id: z.string().uuid('item id must be a valid UUID'),
  quantity: z.number().int().min(1).max(100),
  price: z.number().positive(),
}).strict();

export const checkoutAddressSchema = z.object({
  line1: z.string().trim().min(1).max(255),
  line2: z.string().trim().max(255).optional(),
  city: z.string().trim().min(1).max(120),
  postalCode: z.string().trim().min(1).max(20),
  country: z.string().trim().min(1).max(120),
}).strict();

export const checkoutCustomerSchema = z.object({
  email: z.string().email().max(320),
  address: checkoutAddressSchema,
}).strict();

export default {
  checkoutItemSchema,
  checkoutAddressSchema,
  checkoutCustomerSchema,
};