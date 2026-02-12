import express from 'express';
import { validate } from '../../src/validation/validate.middleware.js';
import { authSchemas, cartSchemas, leadsSchemas, productsSchemas } from '../../src/validation/schemas/index.js';
import authenticate from '../../src/middlewares/authenticate.js';
import authorizeRole from '../../src/middlewares/authorizeRole.js';
import errorHandler from '../../src/middlewares/error-handler.js';

export function buildValidationTestApp() {
  const app = express();

  app.use(express.json());

  app.post('/auth/register', validate(authSchemas.register), (_req, res) => {
    return res.status(201).json({ ok: true });
  });

  app.post('/auth/login', validate(authSchemas.login), (_req, res) => {
    return res.status(200).json({ ok: true });
  });

  app.post('/products', validate(productsSchemas.create), authenticate, authorizeRole('admin'), (_req, res) => {
    return res.status(201).json({ ok: true });
  });

  app.post('/cart/add', validate(cartSchemas.add), (_req, res) => {
    return res.status(201).json({ ok: true });
  });

  app.post('/leads', validate(leadsSchemas.create), (_req, res) => {
    return res.status(201).json({ ok: true });
  });

  app.use(errorHandler);

  return app;
}