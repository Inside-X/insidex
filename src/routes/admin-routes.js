import express from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { requirePermission } from '../middlewares/requirePermission.js';

const adminRouter = express.Router();

// Tous les endpoints de ce router exigent un user authentifié avec rôle admin.
adminRouter.use(authenticate, requirePermission('admin:health:read'));

// GET /api/admin/health
adminRouter.get('/health', (req, res) => {
  return res.status(200).json({
    data: {
      status: 'ok',
      scope: 'admin',
    },
  });
});

export default adminRouter;