import express from 'express';
import { authenticate } from '../middlewares/authenticate.js';

const router = express.Router();

router.get('/admin/reports', authenticate, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Insufficient permissions',
      },
    });
  }

  return res.status(200).json({
    data: {
      message: 'Admin report data',
      user: req.user,
    },
  });
});

export default router;