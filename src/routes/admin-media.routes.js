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

const uploadFinalizeSchema = z.object({
  uploadId: z.string({ required_error: 'uploadId is required' }).trim().min(1, 'uploadId is required'),
  idempotencyKey: z.string({ required_error: 'idempotencyKey is required' }).trim().min(1, 'idempotencyKey is required'),
}).strict({ message: 'unknown field in admin media upload-finalize payload' });

function resolveMediaStorageProviderFactory(req) {
  return req.app?.locals?.mediaStorageProviderFactory || createMediaStorageProvider;
}

router.post(
  '/uploads/init',
  validate(uploadInitSchema),
  async (req, res, next) => {
    try {
      const provider = resolveMediaStorageProviderFactory(req)();
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

router.post(
  '/uploads/finalize',
  validate(uploadFinalizeSchema),
  async (req, res, next) => {
    try {
      const provider = resolveMediaStorageProviderFactory(req)();
      const asset = await provider.finalizeUpload({
        uploadId: req.body.uploadId,
        idempotencyKey: req.body.idempotencyKey,
      });

      return res.status(200).json({
        data: {
          asset: {
            assetId: asset.assetId,
            url: asset.url,
            mimeType: asset.mimeType,
            sizeBytes: asset.sizeBytes,
            width: asset.width,
            height: asset.height,
            checksumSha256: asset.checksumSha256,
            createdAt: asset.createdAt,
          },
        },
      });
    } catch (error) {
      return next(error);
    }
  },
);

export default router;