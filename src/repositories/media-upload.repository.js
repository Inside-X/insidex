import prisma from '../lib/prisma.js';
import { normalizeDbError } from '../lib/db-error.js';

function buildNotFoundError() {
  const notFound = new Error('Database record not found');
  notFound.statusCode = 404;
  notFound.code = 'DB_RECORD_NOT_FOUND';
  return notFound;
}

function mapAssetCreateData(uploadId, asset) {
  return {
    uploadId,
    providerAssetId: asset.assetId,
    url: asset.url,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    width: asset.width,
    height: asset.height,
    checksumSha256: asset.checksumSha256,
    assetCreatedAt: new Date(asset.createdAt),
  };
}

export const mediaUploadRepository = {
  async createUploadSession(payload) {
    try {
      return await prisma.mediaUploadSession.create({
        data: {
          id: payload.uploadId,
          filename: payload.filename,
          mimeType: payload.mimeType,
          sizeBytes: payload.sizeBytes,
          ...(payload.sha256 !== undefined ? { sha256: payload.sha256 } : {}),
          uploadUrl: payload.uploadUrl,
          expiresAt: new Date(payload.expiresAt),
        },
      });
    } catch (error) { normalizeDbError(error, { repository: 'mediaUpload', operation: 'createUploadSession' }); }
  },

  async findUploadSessionById(uploadId) {
    try {
      return await prisma.mediaUploadSession.findUnique({
        where: { id: uploadId },
      });
    } catch (error) { normalizeDbError(error, { repository: 'mediaUpload', operation: 'findUploadSessionById' }); }
  },

  async findFinalizedAssetsByUrls(urls = []) {
    if (!Array.isArray(urls) || urls.length === 0) return [];

    try {
      return await prisma.mediaUploadedAsset.findMany({
        where: {
          url: {
            in: urls,
          },
        },
        select: {
          url: true,
        },
      });
    } catch (error) {
      normalizeDbError(error, { repository: 'mediaUpload', operation: 'findFinalizedAssetsByUrls' });
    }
  },

  async finalizeUploadByIdempotency({ uploadId, idempotencyKey, finalizeWithProvider }) {
    try {
      const session = await prisma.mediaUploadSession.findUnique({
        where: { id: uploadId },
      });

      if (!session) throw buildNotFoundError();
      if (session.expiresAt <= new Date()) throw buildNotFoundError();

      const existing = await prisma.mediaUploadFinalizeIdempotency.findUnique({
        where: {
          uploadId_idempotencyKey: {
            uploadId,
            idempotencyKey,
          },
        },
        include: {
          asset: true,
        },
      });
      if (existing?.asset) return existing.asset;

      const finalizedAsset = await finalizeWithProvider(session);

      return await prisma.$transaction(async (tx) => {
        const createdAsset = await tx.mediaUploadedAsset.create({
          data: mapAssetCreateData(uploadId, finalizedAsset),
        });

        await tx.mediaUploadFinalizeIdempotency.create({
          data: {
            uploadId,
            idempotencyKey,
            assetId: createdAsset.id,
          },
        });

        await tx.mediaUploadSession.update({
          where: { id: uploadId },
          data: {
            finalizedAt: new Date(),
          },
        });

        return createdAsset;
      });
    } catch (error) {
      if (error?.code === 'P2002') {
        try {
          const replayed = await prisma.mediaUploadFinalizeIdempotency.findUnique({
            where: {
              uploadId_idempotencyKey: {
                uploadId,
                idempotencyKey,
              },
            },
            include: { asset: true },
          });
          if (replayed?.asset) return replayed.asset;
        } catch (replayLookupError) {
          normalizeDbError(replayLookupError, { repository: 'mediaUpload', operation: 'finalizeUploadByIdempotency' });
        }
      }

      normalizeDbError(error, { repository: 'mediaUpload', operation: 'finalizeUploadByIdempotency' });
    }
  },
};

export default mediaUploadRepository;
