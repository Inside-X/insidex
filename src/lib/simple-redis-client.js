import { logger } from '../utils/logger.js';

const DEFAULTS = Object.freeze({
  connectTimeoutMs: 2_000,
  maxRetries: 5,
  retryBaseDelayMs: 100,
  retryMaxDelayMs: 3_000,
  required: false,
});

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, timeoutMs, timeoutMessage) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function computeBackoff(attempt, baseDelay, maxDelay) {
  return Math.min(baseDelay * (2 ** Math.max(attempt - 1, 0)), maxDelay);
}

export function createSimpleRedisClient(options = {}) {
  const settings = { ...DEFAULTS, ...options };
  const {
    createClient,
    connectTimeoutMs,
    maxRetries,
    retryBaseDelayMs,
    retryMaxDelayMs,
    required,
    onEvent,
  } = settings;

  if (typeof createClient !== 'function') {
    throw new Error('createSimpleRedisClient requires a createClient function');
  }

  const client = createClient();
  let connected = false;

  const emitEvent = (event, meta = {}) => {
    onEvent?.(event, meta);
    logger.info(`redis_${event}`, meta);
  };

  client.on?.('error', (error) => {
    logger.error('redis_error', { message: error?.message ?? 'unknown' });
    onEvent?.('error', { error });
  });

  client.on?.('reconnecting', (meta) => {
    emitEvent('reconnecting', { ...meta });
  });

  async function connect() {
    let attempt = 0;
    while (attempt <= maxRetries) {
      attempt += 1;
      try {
        await withTimeout(
          Promise.resolve(client.connect()),
          connectTimeoutMs,
          `Redis connection timeout after ${connectTimeoutMs}ms`,
        );
        connected = true;
        emitEvent('connected', { attempt });
        return client;
      } catch (error) {
        connected = false;
        logger.warn('redis_connect_failed', { attempt, message: error.message });
        if (attempt > maxRetries) {
          if (required) {
            throw error;
          }
          return null;
        }
        await delay(computeBackoff(attempt, retryBaseDelayMs, retryMaxDelayMs));
      }
    }
    return null;
  }

  async function quit() {
    try {
      await Promise.resolve(client.quit?.());
      connected = false;
      emitEvent('quit');
    } catch (error) {
      logger.error('redis_quit_failed', { message: error.message });
      throw error;
    }
  }

  return {
    client,
    connect,
    quit,
    isConnected: () => connected,
  };
}

export default createSimpleRedisClient;