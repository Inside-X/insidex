import prisma from '../lib/prisma.js';
import { normalizeDbError } from '../lib/db-error.js';

function normalizePagination(page = 1, pageSize = 24) {
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const safePageSize = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : 24;
  return {
    page: safePage,
    pageSize: safePageSize,
    skip: (safePage - 1) * safePageSize,
  };
}

export const catalogueRepository = {
  async listProducts({ page = 1, pageSize = 24 } = {}) {
    const pagination = normalizePagination(page, pageSize);

    try {
      const [items, totalItems] = await Promise.all([
        prisma.product.findMany({
          skip: pagination.skip,
          take: pagination.pageSize,
          where: { status: 'active' },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: {
            id: true,
            slug: true,
            name: true,
            price: true,
            currency: true,
            stockStatus: true,
            images: {
              orderBy: [{ position: 'asc' }, { id: 'asc' }],
              select: {
                url: true,
                alt: true,
                width: true,
                height: true,
                position: true,
              },
            },
          },
        }),
        prisma.product.count({ where: { status: 'active' } }),
      ]);

      return {
        items,
        pagination: {
          page: pagination.page,
          pageSize: pagination.pageSize,
          totalItems,
          totalPages: Math.max(1, Math.ceil(totalItems / pagination.pageSize)),
        },
      };
    } catch (error) {
      normalizeDbError(error, { repository: 'catalogue', operation: 'listProducts' });
    }
  },

  async getProductBySlug(slug) {
    try {
      return await prisma.product.findUnique({
        where: { slug },
        select: {
          id: true,
          slug: true,
          name: true,
          description: true,
          price: true,
          currency: true,
          stockStatus: true,
          stockQuantity: true,
          backorderable: true,
          images: {
            orderBy: [{ position: 'asc' }, { id: 'asc' }],
            select: {
              url: true,
              alt: true,
              width: true,
              height: true,
              position: true,
            },
          },
          variants: {
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              sku: true,
              label: true,
              attributes: true,
              priceDelta: true,
              absolutePrice: true,
              stockStatus: true,
              stockQuantity: true,
              backorderable: true,
            },
          },
          specs: {
            orderBy: [{ position: 'asc' }, { key: 'asc' }],
            select: {
              key: true,
              value: true,
              position: true,
            },
          },
        },
      });
    } catch (error) {
      normalizeDbError(error, { repository: 'catalogue', operation: 'getProductBySlug' });
    }
  },
};

export default catalogueRepository;