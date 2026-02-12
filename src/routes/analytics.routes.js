import express from 'express';
import { validate } from '../validation/validate.middleware.js';
import { analyticsSchemas } from '../validation/schemas/index.js';
import authenticate from '../middlewares/authenticate.js';
import authorizeRole from '../middlewares/authorizeRole.js';

const router = express.Router();

router.post('/events', validate(analyticsSchemas.track), authenticate, (_req, res) => res.status(201).json({ data: { tracked: true } }));
router.get('/events', validate(analyticsSchemas.listQuery, 'query'), authenticate, authorizeRole('admin'), (_req, res) => res.status(200).json({ data: [] }));

export default router;