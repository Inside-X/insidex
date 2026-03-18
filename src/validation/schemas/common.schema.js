import { z } from 'zod';

export const SECONDARY_PAYLOAD_MAX_KEYS = 120;
export const SECONDARY_PAYLOAD_MAX_BYTES = 16 * 1024;

export const boundedSecondaryPayloadSchema = z.record(z.unknown()).superRefine((payload, ctx) => {
  const keyCount = Object.keys(payload).length;
  if (keyCount > SECONDARY_PAYLOAD_MAX_KEYS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `payload must contain at most ${SECONDARY_PAYLOAD_MAX_KEYS} keys`,
    });
    return;
  }

  let payloadBytes = SECONDARY_PAYLOAD_MAX_BYTES + 1;
  try {
    const serializedPayload = JSON.stringify(payload);
    payloadBytes = Buffer.byteLength(serializedPayload, 'utf8');
  } catch {
    payloadBytes = SECONDARY_PAYLOAD_MAX_BYTES + 1;
  }

  if (payloadBytes > SECONDARY_PAYLOAD_MAX_BYTES) {
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