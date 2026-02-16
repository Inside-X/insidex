import express from 'express';
import { strictValidate } from '../validation/strict-validate.middleware.js';
import { leadsSchemas } from '../validation/schemas/index.js';
import authenticate from '../middlewares/authenticate.js';
import authorizeRole from '../middlewares/authorizeRole.js';

const router = express.Router();

router.post('/', strictValidate(leadsSchemas.create), (_req, res) => res.status(201).json({ data: { created: true } }));
router.get('/', strictValidate(leadsSchemas.listQuery, 'query'), authenticate, authorizeRole('admin'), (_req, res) => res.status(200).json({ data: [] }));

export default router;