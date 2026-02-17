import express from 'express';
import adminRouter from './routes/admin-routes.js';
import adminExampleRouter from './routes/admin-example.routes.js';
import authRouter from './routes/auth.routes.js';
import productsRouter from './routes/products.routes.js';
import cartRouter from './routes/cart.routes.js';
import ordersRouter from './routes/orders.routes.js';
import paymentsRouter from './routes/payments.routes.js';
import leadsRouter from './routes/leads.routes.js';
import analyticsRouter from './routes/analytics.routes.js';
import webhooksRouter from './routes/webhooks.routes.js';
import requestContext from './middlewares/requestContext.js';
import requestLogger from './middlewares/requestLogger.js';
import errorHandler from './middlewares/error-handler.js';
import { securityHeaders } from './middlewares/securityHeaders.js';
import { corsMiddleware } from './middlewares/cors.js';
import { apiRateLimiter } from './middlewares/rateLimit.js';
import { cookieParserMiddleware } from './middlewares/cookieParser.js';
import { payloadGuard } from './middlewares/payloadGuard.js';

const app = express();

app.use(securityHeaders);
app.use(corsMiddleware);
app.use(payloadGuard);
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json', limit: process.env.STRIPE_RAW_BODY_LIMIT || '512kb' }));
app.use('/api/webhooks/paypal', express.raw({ type: 'application/json', limit: process.env.PAYPAL_RAW_BODY_LIMIT || '512kb' }));
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '1mb', strict: true }));
app.use(cookieParserMiddleware);
app.use(requestContext);
app.use(requestLogger);

app.get('/api/health', (req, res) => {
  return res.status(200).json({
    data: {
      status: 'ok',
      scope: 'public',
    },
  });
});

app.use('/api', apiRateLimiter);
app.use('/api/auth', authRouter);
app.use('/api/products', productsRouter);
app.use('/api/cart', cartRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api', adminExampleRouter);
app.use('/api/admin', adminRouter);

app.use(errorHandler);

export default app;