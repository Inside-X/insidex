import { z } from 'zod';

export const SECONDARY_PAYLOAD_MAX_KEYS = 120;
export const SECONDARY_PAYLOAD_MAX_BYTES = 16 * 1024;

function safeJsonSize(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8');
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export const boundedSecondaryPayloadSchema = z
  .record(z.unknown())
  .superRefine((value, ctx) => {
    const keys = Object.keys(value);
    if (keys.length > SECONDARY_PAYLOAD_MAX_KEYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `payload must contain at most ${SECONDARY_PAYLOAD_MAX_KEYS} keys`,
      });
    }

    const bytes = safeJsonSize(value);
    if (bytes > SECONDARY_PAYLOAD_MAX_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `payload must be at most ${SECONDARY_PAYLOAD_MAX_BYTES} bytes`,
      });
    }
  });

export const commonSchemas = {
  boundedSecondaryPayload: boundedSecondaryPayloadSchema,
};

export default commonSchemas;