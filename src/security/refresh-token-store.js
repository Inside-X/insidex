import crypto from 'crypto';

const LUA_VALIDATE_AND_CONSUME = `
-- script: refresh_validate_and_consume_v1
local sessionKey = KEYS[1]
local userLastKey = KEYS[2]
local userId = ARGV[1]
local tokenHash = ARGV[2]
local nowMs = tonumber(ARGV[3])
local minRefreshIntervalMs = tonumber(ARGV[4])

local raw = redis.call('GET', sessionKey)
if not raw then
  return {0, 'unknown'}
end

local session = cjson.decode(raw)
if session.userId ~= userId then
  return {0, 'unknown'}
end

if session.revoked == true then
  return {0, 'revoked'}
end

if session.used == true or (session.replacedBy ~= nil and session.replacedBy ~= cjson.null) then
  session.revoked = true
  redis.call('SET', sessionKey, cjson.encode(session), 'KEEPTTL')
  return {0, 'reused'}
end

if session.tokenHash ~= tokenHash then
  session.revoked = true
  redis.call('SET', sessionKey, cjson.encode(session), 'KEEPTTL')
  return {0, 'unknown'}
end

local lastRefreshAt = tonumber(redis.call('GET', userLastKey) or '0')
if nowMs - lastRefreshAt < minRefreshIntervalMs then
  return {0, 'flood'}
end

session.used = true
session.lastRefreshAt = nowMs
redis.call('SET', sessionKey, cjson.encode(session), 'KEEPTTL')
redis.call('SET', userLastKey, tostring(nowMs), 'PX', minRefreshIntervalMs)

return {1, 'ok'}
`;

const LUA_ROTATE = `
-- script: refresh_rotate_v1
local oldSessionKey = KEYS[1]
local newSessionKey = KEYS[2]
local newSessionRaw = ARGV[1]
local ttlMs = tonumber(ARGV[2])
local newSessionId = ARGV[3]

local oldRaw = redis.call('GET', oldSessionKey)
if not oldRaw then
  return {0, 'unknown'}
end

local oldSession = cjson.decode(oldRaw)
if oldSession.revoked == true then
  return {0, 'revoked'}
end

oldSession.revoked = true
oldSession.replacedBy = newSessionId
redis.call('SET', oldSessionKey, cjson.encode(oldSession), 'KEEPTTL')

local setNew = redis.call('SET', newSessionKey, newSessionRaw, 'NX', 'PX', ttlMs)
if not setNew then
  return {0, 'conflict'}
end

return {1, 'ok'}
`;

let refreshRedisClient = null;

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function sessionKey(sessionId) {
  return `refresh:${sessionId}`;
}

function lastRefreshKey(userId) {
  return `refresh:user:last:${userId}`;
}

function requireRedisClient() {
  if (!refreshRedisClient) {
    throw new Error('Refresh token Redis client is not configured');
  }
  return refreshRedisClient;
}

function buildSessionRecord({ sessionId, userId, token, expiresAt }) {
  return {
    sessionId,
    userId,
    tokenHash: hashToken(token),
    expiresAt,
    used: false,
    revoked: false,
    replacedBy: null,
    createdAt: Date.now(),
    lastRefreshAt: 0,
  };
}

function ttlMsFromExpiresAt(expiresAt) {
  const ttlMs = Number(expiresAt) - Date.now();
  return ttlMs > 0 ? Math.floor(ttlMs) : 0;
}

export function setRefreshTokenRedisClient(client) {
  refreshRedisClient = client || null;
}

export function getRefreshTokenRedisClient() {
  return refreshRedisClient;
}

export async function assertRefreshTokenRedisConnected() {
  const client = requireRedisClient();
  await client.ping();
}

export async function storeRefreshSession({ sessionId, userId, token, expiresAt }) {
  const client = requireRedisClient();
  const ttlMs = ttlMsFromExpiresAt(expiresAt);
  if (ttlMs <= 0) {
    return { ok: false, reason: 'expired' };
  }

  const payload = JSON.stringify(buildSessionRecord({ sessionId, userId, token, expiresAt }));
  const result = await client.set(sessionKey(sessionId), payload, { NX: true, PX: ttlMs });

  if (result !== 'OK') {
    return { ok: false, reason: 'duplicate' };
  }

  return { ok: true };
}

export async function validateAndConsumeRefreshSession({ sessionId, userId, token, minRefreshIntervalMs = 1000 }) {
  const client = requireRedisClient();
  const result = await client.eval(LUA_VALIDATE_AND_CONSUME, {
    keys: [sessionKey(sessionId), lastRefreshKey(userId)],
    arguments: [userId, hashToken(token), String(Date.now()), String(Math.max(0, Number(minRefreshIntervalMs) || 0))],
  });

  const ok = Number(result?.[0]) === 1;
  const reason = String(result?.[1] || 'unknown');

  return ok ? { ok: true } : { ok: false, reason };
}

export async function rotateRefreshSession({ oldSessionId, newSessionId, userId, newToken, newExpiresAt }) {
  const client = requireRedisClient();
  const ttlMs = ttlMsFromExpiresAt(newExpiresAt);
  if (ttlMs <= 0) {
    return { ok: false, reason: 'expired' };
  }

  const newPayload = JSON.stringify(buildSessionRecord({
    sessionId: newSessionId,
    userId,
    token: newToken,
    expiresAt: newExpiresAt,
  }));

  const result = await client.eval(LUA_ROTATE, {
    keys: [sessionKey(oldSessionId), sessionKey(newSessionId)],
    arguments: [newPayload, String(ttlMs), newSessionId],
  });

  const ok = Number(result?.[0]) === 1;
  const reason = String(result?.[1] || 'unknown');
  return ok ? { ok: true } : { ok: false, reason };
}

export async function revokeRefreshSession(sessionId) {
  const client = requireRedisClient();
  const deleted = await client.del(sessionKey(sessionId));
  return Number(deleted) > 0;
}

export async function revokeAllUserRefreshSessions() {
  throw new Error('revokeAllUserRefreshSessions is not supported without indexed storage in strict Redis mode');
}

export function resetRefreshTokenStore() {
  const client = requireRedisClient();
  if (typeof client.flushAll === 'function') {
    client.flushAll();
    return;
  }

  throw new Error('resetRefreshTokenStore requires a Redis test client exposing flushAll');
}

export async function getRefreshSession(sessionId) {
  const client = requireRedisClient();
  const raw = await client.get(sessionKey(sessionId));
  return raw ? JSON.parse(raw) : null;
}

export { LUA_ROTATE, LUA_VALIDATE_AND_CONSUME };