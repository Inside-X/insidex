import express from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { authorizeRole } from '../middlewares/authorizeRole.js';

const adminRouter = express.Router();

// Tous les endpoints de ce router exigent un user authentifié avec rôle admin.
adminRouter.use(authenticate, authorizeRole('admin'));

// GET /api/admin/health
adminRouter.get('/health', (req, res) => {
  return res.status(200).json({
    data: {
      status: 'ok',
      scope: 'admin',
      auth: req.auth,
    },
  });
});

export default adminRouter;