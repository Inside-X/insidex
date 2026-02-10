import express from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { authorizeRole } from '../middlewares/authorizeRole.js';

const router = express.Router();

// Accessible uniquement au rôle admin
router.get('/admin/reports', authenticate, authorizeRole('admin'), (req, res) => {
  return res.status(200).json({
    data: {
      message: 'Admin report data',
      user: req.user,
    },
  });
});

// Accessible aux rôles admin OU ops
router.get('/admin/audit-log', authenticate, authorizeRole(['admin', 'ops']), (req, res) => {
  return res.status(200).json({
    data: {
      message: 'Audit log data',
      user: req.user,
    },
  });
});

export default router;