import prisma from '../lib/prisma.js';
import { normalizeDbError } from '../lib/db-error.js';

function mapAdminProductCoreData(payload) {
  return {
    ...(payload.name !== undefined ? { name: payload.name } : {}),
    ...(payload.slug !== undefined ? { slug: payload.slug } : {}),
    ...(payload.shortDescription !== undefined ? { shortDescription: payload.shortDescription } : {}),
    ...(payload.description !== undefined ? { description: payload.description } : {}),
    ...(payload.price !== undefined ? { price: payload.price } : {}),
    ...(payload.currency !== undefined ? { currency: payload.currency } : {}),
    ...(payload.stock !== undefined ? { stock: payload.stock } : {}),
    ...(payload.status !== undefined ? { status: payload.status } : {}),
  };
}

function mapAdminMediaCreate(media = []) {
  return [...media]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((item) => ({
      id: item.id,
      url: item.url,
      alt: item.alt,
      isPrimary: item.isPrimary,
      kind: item.kind,
      position: item.sortOrder,
    }));
}

export const productRepository = {
  async create(data) {
    try { return await prisma.product.create({ data }); } catch (error) { normalizeDbError(error, { repository: 'product', operation: 'create' }); }
  },
  async findById(id) {
    try { return await prisma.product.findUnique({ where: { id } }); } catch (error) { normalizeDbError(error, { repository: 'product', operation: 'findById' }); }
  },
  async update(id, data) {
    try { return await prisma.product.update({ where: { id }, data }); } catch (error) { normalizeDbError(error, { repository: 'product', operation: 'update' }); }
  },
  async delete(id) {
    try { return await prisma.product.delete({ where: { id } }); } catch (error) { normalizeDbError(error, { repository: 'product', operation: 'delete' }); }
  },
  async list(params = {}) {
    const { skip = 0, take = 50, where = {}, orderBy = { createdAt: 'desc' } } = params;
    try { return await prisma.product.findMany({ skip, take, where, orderBy }); } catch (error) { normalizeDbError(error, { repository: 'product', operation: 'list' }); }
  },
  async createAdminProduct(payload) {
    const data = mapAdminProductCoreData(payload);
    if (payload.media !== undefined) {
      data.images = { create: mapAdminMediaCreate(payload.media) };
    }

    try {
      return await prisma.product.create({
        data,
        include: {
          images: {
            orderBy: { position: 'asc' },
          },
        },
      });
    } catch (error) { normalizeDbError(error, { repository: 'product', operation: 'createAdminProduct' }); }
  },
  async listAdminProducts() {
    try {
      return await prisma.product.findMany({
        orderBy: [
          { createdAt: 'desc' },
          { id: 'asc' },
        ],
        include: {
          images: {
            orderBy: { position: 'asc' },
          },
        },
      });
    } catch (error) { normalizeDbError(error, { repository: 'product', operation: 'listAdminProducts' }); }
  },
  async findAdminProductById(id) {
    try {
      return await prisma.product.findUniqueOrThrow({
        where: { id },
        include: {
          images: {
            orderBy: { position: 'asc' },
          },
        },
      });
    } catch (error) { normalizeDbError(error, { repository: 'product', operation: 'findAdminProductById' }); }
  },
  async updateAdminProductById(id, payload) {
    try {
      return await prisma.product.update({
        where: { id },
        data: mapAdminProductCoreData(payload),
        include: {
          images: {
            orderBy: { position: 'asc' },
          },
        },
      });
    } catch (error) { normalizeDbError(error, { repository: 'product', operation: 'updateAdminProductById' }); }
  },
  async publishProductById(id) {
    try { return await prisma.product.update({ where: { id }, data: { status: 'published' } }); } catch (error) { normalizeDbError(error, { repository: 'product', operation: 'publishProductById' }); }
  },
  async unpublishProductById(id) {
    try { return await prisma.product.update({ where: { id }, data: { status: 'draft' } }); } catch (error) { normalizeDbError(error, { repository: 'product', operation: 'unpublishProductById' }); }
  },
  async replaceProductMediaById(id, media) {
    try {
      return await prisma.product.update({
        where: { id },
        data: {
          images: {
            deleteMany: {},
            create: mapAdminMediaCreate(media),
          },
        },
        include: {
          images: {
            orderBy: { position: 'asc' },
          },
        },
      });
    } catch (error) { normalizeDbError(error, { repository: 'product', operation: 'replaceProductMediaById' }); }
  },
};

export default productRepository;
