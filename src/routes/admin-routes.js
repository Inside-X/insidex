import express from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import prisma from '../lib/prisma.js';
import adminProductsRouter from './admin-products.routes.js';
import adminMediaRouter from './admin-media.routes.js';

const adminRouter = express.Router();

// Tous les endpoints de ce router exigent un user authentifié avec rôle admin.
adminRouter.use(authenticate, requirePermission('admin:health:read'));
adminRouter.use('/products', adminProductsRouter);
adminRouter.use('/media', adminMediaRouter);

// GET /api/admin/health
adminRouter.get('/health', (req, res) => {
  return res.status(200).json({
    data: {
      status: 'ok',
      scope: 'admin',
    },
  });
});



// GET /api/admin/orders/:id/timeline
adminRouter.get('/orders/:id/timeline', async (req, res, next) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        status: true,
        totalAmount: true,
        createdAt: true,
        updatedAt: true,
        events: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            type: true,
            fromStatus: true,
            toStatus: true,
            source: true,
            sourceEventId: true,
            idempotencyKey: true,
            correlationId: true,
            createdAt: true,
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Order not found',
          requestId: req.requestId,
        },
      });
    }

    return res.status(200).json({
      data: {
        order: {
          id: order.id,
          status: order.status,
          totalAmount: order.totalAmount,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
        },
        events: order.events,
      },
    });
  } catch (error) {
    return next(error);
  }
});

// POST /api/admin/refunds
// Safely disabled: provider refund primitives are not implemented in runtime adapters yet.
adminRouter.post('/refunds', (req, res) => {
  return res.status(501).json({
    error: {
      code: 'refund_not_supported',
      message: 'Refund capability is not supported',
      requestId: req.requestId,
    },
  });
});

export default adminRouter;
