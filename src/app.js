import express from 'express';
import adminRouter from './routes/admin-routes.js';
import adminExampleRouter from './routes/admin-example.routes.js';
import requestContext from './middlewares/requestContext.js';
import errorHandler from './middlewares/error-handler.js';

const app = express();

app.use(express.json());
app.use(requestContext);

// Route publique non protégée de démo
app.get('/api/health', (req, res) => {
  return res.status(200).json({
    data: {
      status: 'ok',
      scope: 'public',
    },
  });
});

// Routes RBAC d'exemple explicites (admin + multi-rôles)
app.use('/api', adminExampleRouter);

// Toutes les routes /api/admin/* restantes héritent des middlewares déclarés dans adminRouter.use(...)
app.use('/api/admin', adminRouter);

// Error handler global (doit être déclaré en dernier).
app.use(errorHandler);

export default app;