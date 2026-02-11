import { z } from 'zod';

const EMAIL_MAX = 255;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 100;

const emailSchema = z.string({ required_error: 'email is required' })
  .trim()
  .toLowerCase()
  .email('email must be a valid email address')
  .max(EMAIL_MAX, `email must contain at most ${EMAIL_MAX} characters`);

const passwordSchema = z.string({ required_error: 'password is required' })
  .min(PASSWORD_MIN, `password must contain at least ${PASSWORD_MIN} characters`)
  .max(PASSWORD_MAX, `password must contain at most ${PASSWORD_MAX} characters`);

export const registerSchema = z
  .object({
    // Normalise l'email pour unicité et indexation future en base PostgreSQL.
    email: emailSchema,
    // Limites explicites pour réduire les payloads abusifs.
    password: passwordSchema,
    // Enum fermée compatible colonne SQL CHECK / ENUM.
    role: z.enum(['admin', 'customer'], {
      invalid_type_error: 'role must be either admin or customer'
    }).default('customer')
  })
  .strict({ message: 'unknown field in register payload' });

export const loginSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema
  })
  .strict({ message: 'unknown field in login payload' });

export const authSchemas = {
  register: registerSchema,
  login: loginSchema,
  refresh: z.object({ refreshToken: z.string().min(1).max(2048) }).strict({ message: 'unknown field in refresh payload' }),
  logout: z.object({ refreshToken: z.string().min(1).max(2048) }).strict({ message: 'unknown field in logout payload' }),
  forgot: z.object({ email: emailSchema }).strict({ message: 'unknown field in forgot payload' }),
  reset: z.object({
    email: emailSchema,
    resetToken: z.string().min(8).max(512),
    newPassword: passwordSchema
  }).strict({ message: 'unknown field in reset payload' })
};