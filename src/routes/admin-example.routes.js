import express from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { requirePermission } from '../middlewares/requirePermission.js';

const router = express.Router();

// Accessible uniquement au rôle admin
router.get('/admin/reports', authenticate, requirePermission('reports:read'), (req, res) => {
  return res.status(200).json({
    data: {
      message: 'Admin report data',
    },
  });
});

// Accessible aux rôles admin OU ops
router.get('/admin/audit-log', authenticate, requirePermission('audit-log:read'), (req, res) => {
  return res.status(200).json({
    data: {
      message: 'Audit log data',
    },
  });
});

export default router;