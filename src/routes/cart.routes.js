import express from 'express';
import { validate } from '../validation/validate.middleware.js';
import { cartSchemas } from '../validation/schemas/index.js';
import authenticate from '../middlewares/authenticate.js';

const router = express.Router();

router.get('/', validate(cartSchemas.getCartQuery, 'query'), authenticate, (req, res) => res.status(200).json({ data: { owner: req.auth.sub } }));
router.post('/items', validate(cartSchemas.add), authenticate, (req, res) => res.status(201).json({ data: req.body }));
router.patch('/items/:id', validate(cartSchemas.updateItemParams, 'params'), validate(cartSchemas.updateItemBody), authenticate, (req, res) => res.status(200).json({ data: { id: req.params.id, ...req.body } }));
router.delete('/items/:id', validate(cartSchemas.removeItemParams, 'params'), validate(cartSchemas.removeItemBody), authenticate, (req, res) => res.status(204).end());

export default router;