import net from 'node:net';

function parseRedisUrl(redisUrl) {
  const parsed = new URL(redisUrl);
  if (parsed.protocol !== 'redis:') {
    throw new Error('Only redis:// URLs are supported');
  }

  return {
    host: parsed.hostname || '127.0.0.1',
    port: Number(parsed.port || 6379),
  };
}

function encodeCommand(parts) {
  const chunks = [`*${parts.length}\r\n`];
  for (const part of parts) {
    const text = String(part);
    chunks.push(`$${Buffer.byteLength(text)}\r\n${text}\r\n`);
  }
  return chunks.join('');
}

function decodeFrame(buffer, offset = 0) {
  const prefix = String.fromCharCode(buffer[offset]);

  function findCrlf(start) {
    const index = buffer.indexOf('\r\n', start, 'utf8');
    if (index === -1) return -1;
    return index;
  }

  if (prefix === '+' || prefix === '-' || prefix === ':') {
    const end = findCrlf(offset + 1);
    if (end === -1) return null;
    const raw = buffer.toString('utf8', offset + 1, end);
    if (prefix === '+') return { value: raw, next: end + 2 };
    if (prefix === ':') return { value: Number(raw), next: end + 2 };
    throw new Error(raw);
  }

  if (prefix === '$') {
    const end = findCrlf(offset + 1);
    if (end === -1) return null;
    const length = Number(buffer.toString('utf8', offset + 1, end));
    if (length === -1) return { value: null, next: end + 2 };
    const start = end + 2;
    const final = start + length;
    if (buffer.length < final + 2) return null;
    const value = buffer.toString('utf8', start, final);
    return { value, next: final + 2 };
  }

  if (prefix === '*') {
    const end = findCrlf(offset + 1);
    if (end === -1) return null;
    const count = Number(buffer.toString('utf8', offset + 1, end));
    let cursor = end + 2;
    const items = [];

    for (let i = 0; i < count; i += 1) {
      const item = decodeFrame(buffer, cursor);
      if (!item) return null;
      items.push(item.value);
      cursor = item.next;
    }

    return { value: items, next: cursor };
  }

  return null;
}

export function createRedisClient({ url }) {
  const { host, port } = parseRedisUrl(url);
  let socket = null;
  let pending = [];
  let dataBuffer = Buffer.alloc(0);

  function ensureSocket() {
    if (socket && !socket.destroyed) return Promise.resolve();

    return new Promise((resolve, reject) => {
      socket = net.createConnection({ host, port }, resolve);
      socket.setNoDelay(true);

      socket.on('data', (chunk) => {
        dataBuffer = Buffer.concat([dataBuffer, chunk]);

        while (pending.length > 0) {
          const frame = decodeFrame(dataBuffer);
          if (!frame) break;

          dataBuffer = dataBuffer.subarray(frame.next);
          const next = pending.shift();
          try {
            next.resolve(frame.value);
          } catch (error) {
            next.reject(error);
          }
        }
      });

      socket.on('error', (error) => {
        while (pending.length > 0) {
          pending.shift().reject(error);
        }
      });

      socket.on('close', () => {
        socket = null;
      });

      socket.on('connect', async () => {
        try {
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  async function send(parts) {
    await ensureSocket();

    return new Promise((resolve, reject) => {
      pending.push({ resolve, reject });
      socket.write(encodeCommand(parts), (error) => {
        if (error) {
          pending = pending.filter((entry) => entry.resolve !== resolve);
          reject(error);
        }
      });
    });
  }

  return {
    on() {},
    get isOpen() {
      return Boolean(socket && !socket.destroyed);
    },
    connect() {
      return ensureSocket();
    },
    async eval(script, payload) {
      const keys = payload?.keys || [];
      const args = payload?.arguments || [];
      const reply = await send(['EVAL', script, keys.length, ...keys, ...args]);
      return Array.isArray(reply) ? reply : [];
    },
    async scan(cursor, payload = {}) {
      const parts = ['SCAN', cursor, 'MATCH', payload.MATCH || '*', 'COUNT', payload.COUNT || 100];
      return send(parts);
    },
    async del(keys) {
      if (!keys || keys.length === 0) return 0;
      return send(['DEL', ...keys]);
    },
    async quit() {
      if (!socket || socket.destroyed) return;
      await send(['QUIT']);
      socket.end();
    },
  };
}

export default createRedisClient;