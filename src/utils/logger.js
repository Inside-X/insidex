const LEVELS = Object.freeze({
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
});

const SENSITIVE_KEY_PATTERN = /authorization|cookie|token|secret|signature|jwt|password|paypal|stripe/i;
const SENSITIVE_VALUE_PATTERN = /(Bearer\s+[A-Za-z0-9._~+\/-]+=*|SECRET_[A-Z0-9_]+|refreshToken=)/i;

function resolveLevel() {
  if (process.env.LOG_LEVEL) {
    return process.env.LOG_LEVEL.toLowerCase();
  }
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

const currentLevel = LEVELS[resolveLevel()] ?? LEVELS.info;

function shouldLog(level) {
  return LEVELS[level] >= currentLevel;
}

function resolveFormat() {
  if (process.env.NODE_ENV === 'production') return 'json';
  if (process.env.LOG_FORMAT === 'pretty') return 'pretty';
  return 'json';
}

function isSensitiveKey(key) {
  return SENSITIVE_KEY_PATTERN.test(String(key || ''));
}

function redactString(value) {
  if (!SENSITIVE_VALUE_PATTERN.test(value)) return value;
  return '[REDACTED]';
}

function sanitizeMeta(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(String(value.message || '')),
      stack: typeof value.stack === 'string' ? value.stack : undefined,
      code: value.code,
    };
  }

  if (typeof value === 'string') {
    return redactString(value);
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeMeta(item, seen));
  }

  const sanitized = {};
  for (const [key, entryValue] of Object.entries(value)) {
    if (isSensitiveKey(key)) {
      sanitized[key] = '[REDACTED]';
      continue;
    }

    sanitized[key] = sanitizeMeta(entryValue, seen);
  }

  return sanitized;
}

function buildPayload(level, event, meta) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event: String(event || '').replace(/[\r\n]+/g, ' '),
  };

  if (meta !== undefined) {
    const sanitizedMeta = sanitizeMeta(meta);
    if (sanitizedMeta && typeof sanitizedMeta === 'object' && !Array.isArray(sanitizedMeta)) {
      Object.assign(payload, sanitizedMeta);
    } else {
      payload.meta = sanitizedMeta;
    }
  }

  return payload;
}

function serializeJsonLine(payload) {
  try {
    return JSON.stringify(payload);
  } catch {
    return JSON.stringify({
      timestamp: payload.timestamp,
      level: payload.level,
      event: payload.event,
      meta: '[unserializable]',
    });
  }
}

function serializePrettyLine(payload) {
  const { timestamp, level, event, correlationId, ...meta } = payload;
  const prefix = `${timestamp} ${String(level).toUpperCase()} ${event}`;

  if (correlationId !== undefined) {
    meta.correlationId = correlationId;
  }

  if (Object.keys(meta).length === 0) {
    return prefix;
  }

  try {
    return `${prefix} ${JSON.stringify(meta)}`;
  } catch {
    return `${prefix} ${JSON.stringify({ meta: '[unserializable]' })}`;
  }
}

function emit(level, event, meta) {
  if (!shouldLog(level)) return;

  const payload = buildPayload(level, event, meta);
  const line = resolveFormat() === 'pretty' ? serializePrettyLine(payload) : serializeJsonLine(payload);

  if (level === 'error') {
    console.error(line);
    return;
  }

  if (level === 'warn') {
    console.warn(line);
    return;
  }

  console.log(line);
}

export const logger = {
  debug(event, meta) {
    emit('debug', event, meta);
  },
  info(event, meta) {
    emit('info', event, meta);
  },
  warn(event, meta) {
    emit('warn', event, meta);
  },
  error(event, meta) {
    emit('error', event, meta);
  },
};

export default logger;