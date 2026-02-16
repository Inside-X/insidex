import express from 'express';
import { validate } from '../validation/validate.middleware.js';
import { strictValidate } from '../validation/strict-validate.middleware.js';
import { productsSchemas } from '../validation/schemas/index.js';
import authenticate from '../middlewares/authenticate.js';
import authorizeRole from '../middlewares/authorizeRole.js';

const router = express.Router();

router.get('/', validate(productsSchemas.listQuery, 'query'), (_req, res) => res.status(200).json({ data: [] }));
router.get('/:id', validate(productsSchemas.byIdParams, 'params'), (req, res) => res.status(200).json({ data: { id: req.params.id } }));
router.post('/', strictValidate(productsSchemas.create), authenticate, authorizeRole('admin'), (req, res) => res.status(201).json({ data: req.body }));

export default router;