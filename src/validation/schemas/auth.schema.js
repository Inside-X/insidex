import { z } from 'zod';
import { emailSchema, passwordSchema } from './common.schema.js';

export const authSchemas = {
  register: z
    .object({
      email: emailSchema,
      password: passwordSchema,
      name: z.string().trim().min(1).max(120).optional()
    })
    .strip(),

  login: z
    .object({
      email: emailSchema,
      password: passwordSchema
    })
    .strip(),

  refresh: z
    .object({
      refreshToken: z.string().trim().min(1).max(2048)
    })
    .strip(),

  logout: z
    .object({
      refreshToken: z.string().trim().min(1).max(2048)
    })
    .strip(),

  forgot: z
    .object({
      email: emailSchema
    })
    .strip(),

  reset: z
    .object({
      email: emailSchema,
      resetToken: z.string().trim().min(8).max(512),
      newPassword: passwordSchema
    })
    .strip()
};