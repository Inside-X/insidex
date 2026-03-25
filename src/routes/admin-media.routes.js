import express from 'express';
import { z } from 'zod';
import { validate } from '../validation/validate.middleware.js';
import {
  ALLOWED_MEDIA_MIME_TYPES,
  MAX_MEDIA_UPLOAD_SIZE_BYTES,
  createMediaStorageProvider,
} from '../lib/media-storage-provider.js';

const router = express.Router();

const uploadInitSchema = z.object({
  filename: z.string({ required_error: 'filename is required' }).trim().min(1, 'filename is required'),
  mimeType: z.string({ required_error: 'mimeType is required' }).refine(
    (value) => ALLOWED_MEDIA_MIME_TYPES.includes(value),
    `mimeType must be one of: ${ALLOWED_MEDIA_MIME_TYPES.join(', ')}`,
  ),
  sizeBytes: z.number({ required_error: 'sizeBytes is required', invalid_type_error: 'sizeBytes must be an integer' })
    .int('sizeBytes must be an integer')
    .positive('sizeBytes must be greater than 0')
    .max(MAX_MEDIA_UPLOAD_SIZE_BYTES, `sizeBytes must be less than or equal to ${MAX_MEDIA_UPLOAD_SIZE_BYTES}`),
  sha256: z.string().trim().min(1, 'sha256 must not be empty').optional(),
}).strict({ message: 'unknown field in admin media upload-init payload' });

router.post(
  '/uploads/init',
  validate(uploadInitSchema),
  async (req, res, next) => {
    try {
      const provider = createMediaStorageProvider();
      const upload = await provider.createUploadTarget({
        filename: req.body.filename,
        mimeType: req.body.mimeType,
        sizeBytes: req.body.sizeBytes,
        ...(req.body.sha256 !== undefined ? { sha256: req.body.sha256 } : {}),
      });

      return res.status(200).json({
        data: {
          upload,
        },
      });
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
