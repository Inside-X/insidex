import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import app from './src/app.js';
import { logger } from './src/utils/logger.js';
import { assertProductionBootConfigOrExit } from './src/config/boot-validation.js';
import { setRefreshTokenRedisClient } from './src/security/refresh-token-store.js';
import { setRateLimitRedisClient } from './src/middlewares/rateLimit.js';
import { assertProductionInfrastructureOrExit } from './src/config/boot-infrastructure.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;

assertProductionBootConfigOrExit();

await assertProductionInfrastructureOrExit({
  onRedisClient(redisClient) {
    setRefreshTokenRedisClient(redisClient);
    setRateLimitRedisClient(redisClient);
  },
});

app.disable('x-powered-by');

app.use('/assets', express.static(path.join(__dirname, 'assets'), { dotfiles: 'ignore' }));
app.use('/css', express.static(path.join(__dirname, 'css'), { dotfiles: 'ignore' }));
app.use('/js', express.static(path.join(__dirname, 'js'), { dotfiles: 'ignore' }));

app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/account.html', (_req, res) => res.sendFile(path.join(__dirname, 'account.html')));
app.get('/checkout.html', (_req, res) => res.sendFile(path.join(__dirname, 'checkout.html')));
app.get('/product.html', (_req, res) => res.sendFile(path.join(__dirname, 'product.html')));
app.get('/style.css', (_req, res) => res.sendFile(path.join(__dirname, 'style.css')));
app.get('/script.js', (_req, res) => res.sendFile(path.join(__dirname, 'script.js')));

app.listen(PORT, () => {
  logger.info('server_started', { port: PORT });
});