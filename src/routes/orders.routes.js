import express from 'express';
import { validate } from '../validation/validate.middleware.js';
import { ordersSchemas } from '../validation/schemas/index.js';
import authenticate from '../middlewares/authenticate.js';
import authorizeRole from '../middlewares/authorizeRole.js';

const router = express.Router();

router.post('/', validate(ordersSchemas.create), authenticate, (req, res) => res.status(201).json({ data: { id: 'order-test', ...req.body } }));
router.get('/:id', validate(ordersSchemas.byIdParams, 'params'), authenticate, authorizeRole(['admin', 'customer']), (req, res) => res.status(200).json({ data: { id: req.params.id } }));

export default router;