import express from 'express';
import adminRouter from './routes/admin-routes.js';

const app = express();

app.use(express.json());

// Route publique non protégée de démo
app.get('/api/health', (req, res) => {
  return res.status(200).json({
    data: {
      status: 'ok',
      scope: 'public',
    },
  });
});

// Toutes les routes /api/admin/* héritent des middlewares déclarés dans adminRouter.use(...)
app.use('/api/admin', adminRouter);

export default app;