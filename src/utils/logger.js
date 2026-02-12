const LEVELS = Object.freeze({
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
});

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

function serializeMeta(meta) {
  if (!meta) return '';
  try {
    return ` ${JSON.stringify(meta)}`;
  } catch {
    return ' {"meta":"[unserializable]"}';
  }
}

function emit(level, message, meta) {
  if (!shouldLog(level)) return;
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}${serializeMeta(meta)}`;

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
  debug(message, meta) {
    emit('debug', message, meta);
  },
  info(message, meta) {
    emit('info', message, meta);
  },
  warn(message, meta) {
    emit('warn', message, meta);
  },
  error(message, meta) {
    emit('error', message, meta);
  },
};

export default logger;