import { jest } from '@jest/globals';

async function loadMediaUploadRepository({ normalizeImpl } = {}) {
  jest.resetModules();

  const prismaMock = {
    mediaUploadSession: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    mediaUploadFinalizeIdempotency: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    mediaUploadedAsset: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  };
  prismaMock.$transaction = jest.fn(async (callback) => callback({
    mediaUploadedAsset: prismaMock.mediaUploadedAsset,
    mediaUploadFinalizeIdempotency: prismaMock.mediaUploadFinalizeIdempotency,
    mediaUploadSession: prismaMock.mediaUploadSession,
  }));

  const normalizeDbError = jest.fn(normalizeImpl || ((error) => { throw error; }));

  await jest.unstable_mockModule('../../src/lib/prisma.js', () => ({ default: prismaMock }));
  await jest.unstable_mockModule('../../src/lib/db-error.js', () => ({ normalizeDbError }));

  const { mediaUploadRepository } = await import('../../src/repositories/media-upload.repository.js');
  return { mediaUploadRepository, prismaMock, normalizeDbError };
}

describe('mediaUploadRepository', () => {
  test('createUploadSession persists expected fields', async () => {
    const { mediaUploadRepository, prismaMock } = await loadMediaUploadRepository();
    prismaMock.mediaUploadSession.create.mockResolvedValueOnce({ id: 'ul_01H' });

    await mediaUploadRepository.createUploadSession({
      uploadId: 'ul_01H',
      filename: 'amani-chair-main.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 734003,
      sha256: 'abc123',
      uploadUrl: 'https://uploads.example.com/upload/ul_01H',
      expiresAt: '2026-03-25T12:00:00.000Z',
    });

    expect(prismaMock.mediaUploadSession.create).toHaveBeenCalledWith({
      data: {
        id: 'ul_01H',
        filename: 'amani-chair-main.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 734003,
        sha256: 'abc123',
        uploadUrl: 'https://uploads.example.com/upload/ul_01H',
        expiresAt: new Date('2026-03-25T12:00:00.000Z'),
      },
    });
  });

  test('finalizeUploadByIdempotency returns replayed asset when idempotency record exists', async () => {
    const { mediaUploadRepository, prismaMock } = await loadMediaUploadRepository();

    prismaMock.mediaUploadSession.findUnique.mockResolvedValueOnce({
      id: 'ul_01H',
      mimeType: 'image/jpeg',
      sizeBytes: 734003,
      sha256: 'abc123',
      expiresAt: new Date(Date.now() + 60_000),
    });
    prismaMock.mediaUploadFinalizeIdempotency.findUnique.mockResolvedValueOnce({
      id: 'replay',
      asset: { id: 'asset_db_1', providerAssetId: 'ast_01H' },
    });

    const asset = await mediaUploadRepository.finalizeUploadByIdempotency({
      uploadId: 'ul_01H',
      idempotencyKey: 'key-1',
      finalizeWithProvider: jest.fn(),
    });

    expect(asset).toEqual({ id: 'asset_db_1', providerAssetId: 'ast_01H' });
  });

  test('finalizeUploadByIdempotency creates asset and idempotency record for first finalize', async () => {
    const { mediaUploadRepository, prismaMock } = await loadMediaUploadRepository();

    prismaMock.mediaUploadSession.findUnique.mockResolvedValueOnce({
      id: 'ul_01H',
      mimeType: 'image/jpeg',
      sizeBytes: 734003,
      sha256: 'abc123',
      expiresAt: new Date(Date.now() + 60_000),
    });
    prismaMock.mediaUploadFinalizeIdempotency.findUnique.mockResolvedValueOnce(null);
    prismaMock.mediaUploadedAsset.create.mockResolvedValueOnce({ id: 'asset_db_1' });
    prismaMock.mediaUploadFinalizeIdempotency.create.mockResolvedValueOnce({ id: 'idem_1' });
    prismaMock.mediaUploadSession.update.mockResolvedValueOnce({ id: 'ul_01H' });

    const finalizeWithProvider = jest.fn().mockResolvedValueOnce({
      assetId: 'ast_01H',
      url: 'https://cdn.example.com/assets/a.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 734003,
      width: 1600,
      height: 1200,
      checksumSha256: 'abc123',
      createdAt: '2026-03-25T12:00:10.000Z',
    });

    await mediaUploadRepository.finalizeUploadByIdempotency({
      uploadId: 'ul_01H',
      idempotencyKey: 'key-1',
      finalizeWithProvider,
    });

    expect(finalizeWithProvider).toHaveBeenCalled();
    expect(prismaMock.mediaUploadFinalizeIdempotency.create).toHaveBeenCalledWith({
      data: {
        uploadId: 'ul_01H',
        idempotencyKey: 'key-1',
        assetId: 'asset_db_1',
      },
    });
  });

  test('finalizeUploadByIdempotency throws not-found error for unknown uploadId', async () => {
    const { mediaUploadRepository } = await loadMediaUploadRepository();

    await expect(mediaUploadRepository.finalizeUploadByIdempotency({
      uploadId: 'missing',
      idempotencyKey: 'key-1',
      finalizeWithProvider: jest.fn(),
    })).rejects.toMatchObject({
      statusCode: 404,
      code: 'DB_RECORD_NOT_FOUND',
    });
  });

  test('finalizeUploadByIdempotency throws not-found error for expired upload session', async () => {
    const { mediaUploadRepository, prismaMock } = await loadMediaUploadRepository();
    prismaMock.mediaUploadSession.findUnique.mockResolvedValueOnce({
      id: 'ul_expired',
      mimeType: 'image/jpeg',
      sizeBytes: 734003,
      sha256: 'abc123',
      expiresAt: new Date(Date.now() - 60_000),
    });

    await expect(mediaUploadRepository.finalizeUploadByIdempotency({
      uploadId: 'ul_expired',
      idempotencyKey: 'key-expired',
      finalizeWithProvider: jest.fn(),
    })).rejects.toMatchObject({
      statusCode: 404,
      code: 'DB_RECORD_NOT_FOUND',
    });
  });

  test('createUploadSession propagates normalized DB failure', async () => {
    const dbError = new Error('create failed');
    const { mediaUploadRepository, prismaMock, normalizeDbError } = await loadMediaUploadRepository();
    prismaMock.mediaUploadSession.create.mockRejectedValueOnce(dbError);

    await expect(mediaUploadRepository.createUploadSession({
      uploadId: 'ul_01H',
      filename: 'amani-chair-main.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 734003,
      uploadUrl: 'https://uploads.example.com/upload/ul_01H',
      expiresAt: '2026-03-25T12:00:00.000Z',
    })).rejects.toThrow('create failed');

    expect(normalizeDbError).toHaveBeenCalledWith(dbError, {
      repository: 'mediaUpload',
      operation: 'createUploadSession',
    });
  });

  test('findUploadSessionById propagates normalized DB failure', async () => {
    const dbError = new Error('find failed');
    const { mediaUploadRepository, prismaMock, normalizeDbError } = await loadMediaUploadRepository();
    prismaMock.mediaUploadSession.findUnique.mockRejectedValueOnce(dbError);

    await expect(mediaUploadRepository.findUploadSessionById('ul_01H')).rejects.toThrow('find failed');

    expect(normalizeDbError).toHaveBeenCalledWith(dbError, {
      repository: 'mediaUpload',
      operation: 'findUploadSessionById',
    });
  });

  test('findFinalizedAssetsByUrls queries media assets by URL list', async () => {
    const { mediaUploadRepository, prismaMock } = await loadMediaUploadRepository();
    prismaMock.mediaUploadedAsset.findMany.mockResolvedValueOnce([{ url: 'https://cdn.example.com/assets/a.jpg' }]);

    const result = await mediaUploadRepository.findFinalizedAssetsByUrls([
      'https://cdn.example.com/assets/a.jpg',
      'https://cdn.example.com/assets/b.jpg',
    ]);

    expect(prismaMock.mediaUploadedAsset.findMany).toHaveBeenCalledWith({
      where: {
        url: {
          in: [
            'https://cdn.example.com/assets/a.jpg',
            'https://cdn.example.com/assets/b.jpg',
          ],
        },
      },
      select: {
        url: true,
      },
    });
    expect(result).toEqual([{ url: 'https://cdn.example.com/assets/a.jpg' }]);
  });

  test('findFinalizedAssetsByUrls returns empty list for empty input', async () => {
    const { mediaUploadRepository, prismaMock } = await loadMediaUploadRepository();

    const result = await mediaUploadRepository.findFinalizedAssetsByUrls([]);

    expect(result).toEqual([]);
    expect(prismaMock.mediaUploadedAsset.findMany).not.toHaveBeenCalled();
  });

  test('finalizeUploadByIdempotency returns replayed asset after P2002 conflict', async () => {
    const uniqueConflict = Object.assign(new Error('duplicate'), { code: 'P2002' });
    const { mediaUploadRepository, prismaMock } = await loadMediaUploadRepository();

    prismaMock.mediaUploadSession.findUnique.mockResolvedValueOnce({
      id: 'ul_01H',
      mimeType: 'image/jpeg',
      sizeBytes: 734003,
      sha256: 'abc123',
      expiresAt: new Date(Date.now() + 60_000),
    });
    prismaMock.mediaUploadFinalizeIdempotency.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        asset: { id: 'asset_db_2', providerAssetId: 'ast_replay' },
      });
    prismaMock.mediaUploadedAsset.create.mockRejectedValueOnce(uniqueConflict);

    const result = await mediaUploadRepository.finalizeUploadByIdempotency({
      uploadId: 'ul_01H',
      idempotencyKey: 'key-2',
      finalizeWithProvider: jest.fn().mockResolvedValue({
        assetId: 'ast_01H',
        url: 'https://cdn.example.com/assets/a.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 734003,
        width: 1600,
        height: 1200,
        checksumSha256: 'abc123',
        createdAt: '2026-03-25T12:00:10.000Z',
      }),
    });

    expect(result).toEqual({ id: 'asset_db_2', providerAssetId: 'ast_replay' });
  });

  test('finalizeUploadByIdempotency normalizes replay lookup failure after P2002', async () => {
    const uniqueConflict = Object.assign(new Error('duplicate'), { code: 'P2002' });
    const replayLookupError = new Error('replay lookup failed');
    const { mediaUploadRepository, prismaMock, normalizeDbError } = await loadMediaUploadRepository({
      normalizeImpl: () => undefined,
    });

    prismaMock.mediaUploadSession.findUnique.mockResolvedValueOnce({
      id: 'ul_01H',
      mimeType: 'image/jpeg',
      sizeBytes: 734003,
      sha256: 'abc123',
      expiresAt: new Date(Date.now() + 60_000),
    });
    prismaMock.mediaUploadFinalizeIdempotency.findUnique.mockResolvedValueOnce(null);
    prismaMock.mediaUploadedAsset.create.mockRejectedValueOnce(uniqueConflict);
    prismaMock.mediaUploadFinalizeIdempotency.findUnique.mockRejectedValueOnce(replayLookupError);

    await mediaUploadRepository.finalizeUploadByIdempotency({
      uploadId: 'ul_01H',
      idempotencyKey: 'key-3',
      finalizeWithProvider: jest.fn().mockResolvedValue({
        assetId: 'ast_03H',
        url: 'https://cdn.example.com/assets/c.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 734003,
        width: 1600,
        height: 1200,
        checksumSha256: 'abc123',
        createdAt: '2026-03-25T12:00:10.000Z',
      }),
    });

    expect(normalizeDbError).toHaveBeenCalledWith(replayLookupError, {
      repository: 'mediaUpload',
      operation: 'finalizeUploadByIdempotency',
    });
  });

  test('finalizeUploadByIdempotency normalizes original P2002 when replay lookup has no asset', async () => {
    const uniqueConflict = Object.assign(new Error('duplicate'), { code: 'P2002' });
    const { mediaUploadRepository, prismaMock, normalizeDbError } = await loadMediaUploadRepository({
      normalizeImpl: () => undefined,
    });

    prismaMock.mediaUploadSession.findUnique.mockResolvedValueOnce({
      id: 'ul_01H',
      mimeType: 'image/jpeg',
      sizeBytes: 734003,
      sha256: 'abc123',
      expiresAt: new Date(Date.now() + 60_000),
    });
    prismaMock.mediaUploadFinalizeIdempotency.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ asset: null });
    prismaMock.mediaUploadedAsset.create.mockRejectedValueOnce(uniqueConflict);

    await mediaUploadRepository.finalizeUploadByIdempotency({
      uploadId: 'ul_01H',
      idempotencyKey: 'key-4',
      finalizeWithProvider: jest.fn().mockResolvedValue({
        assetId: 'ast_04H',
        url: 'https://cdn.example.com/assets/d.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 734003,
        width: 1600,
        height: 1200,
        checksumSha256: 'abc123',
        createdAt: '2026-03-25T12:00:10.000Z',
      }),
    });

    expect(normalizeDbError).toHaveBeenCalledWith(uniqueConflict, {
      repository: 'mediaUpload',
      operation: 'finalizeUploadByIdempotency',
    });
  });
});
