import crypto from 'crypto';

const refreshSessions = new Map();
const userSessions = new Map();
const userLastRefresh = new Map();

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function touchUserSession(userId, sessionId) {
  const sessions = userSessions.get(userId) ?? new Set();
  sessions.add(sessionId);
  userSessions.set(userId, sessions);
}

function deleteUserSession(userId, sessionId) {
  const sessions = userSessions.get(userId);
  if (!sessions) return;

  sessions.delete(sessionId);
  if (sessions.size === 0) {
    userSessions.delete(userId);
  }
}

export function storeRefreshSession({ sessionId, userId, token, expiresAt }) {
  const tokenHash = hashToken(token);
  refreshSessions.set(sessionId, {
    sessionId,
    userId,
    tokenHash,
    expiresAt,
    used: false,
    revoked: false,
    replacedBy: null,
    createdAt: Date.now(),
    lastRefreshAt: 0,
  });
  touchUserSession(userId, sessionId);
}

export function validateAndConsumeRefreshSession({ sessionId, userId, token, minRefreshIntervalMs = 1000 }) {
  const session = refreshSessions.get(sessionId);
  if (!session || session.userId !== userId) {
    return { ok: false, reason: 'unknown' };
  }

  if (session.revoked) {
    return { ok: false, reason: 'revoked' };
  }

  if (Date.now() > session.expiresAt) {
    session.revoked = true;
    return { ok: false, reason: 'expired' };
  }

  if (session.used || session.replacedBy) {
    session.revoked = true;
    return { ok: false, reason: 'reused' };
  }

  const lastUserRefreshAt = userLastRefresh.get(userId) || 0;
  if (Date.now() - lastUserRefreshAt < minRefreshIntervalMs) {
    return { ok: false, reason: 'flood' };
  }

  if (session.tokenHash !== hashToken(token)) {
    session.revoked = true;
    return { ok: false, reason: 'unknown' };
  }

  session.used = true;
  session.lastRefreshAt = Date.now();
  userLastRefresh.set(userId, session.lastRefreshAt);
  return { ok: true, session };
}

export function rotateRefreshSession({ oldSessionId, newSessionId, userId, newToken, newExpiresAt }) {
  const oldSession = refreshSessions.get(oldSessionId);
  if (oldSession) {
    oldSession.revoked = true;
    oldSession.replacedBy = newSessionId;
  }

  storeRefreshSession({
    sessionId: newSessionId,
    userId,
    token: newToken,
    expiresAt: newExpiresAt,
  });
}

export function revokeRefreshSession(sessionId) {
  const session = refreshSessions.get(sessionId);
  if (!session) return false;

  session.revoked = true;
  deleteUserSession(session.userId, sessionId);
  return true;
}

export function revokeAllUserRefreshSessions(userId) {
  const sessions = userSessions.get(userId);
  if (!sessions) return 0;

  let count = 0;
  for (const sessionId of sessions.values()) {
    const session = refreshSessions.get(sessionId);
    if (session) {
      session.revoked = true;
      count += 1;
    }
  }

  userSessions.delete(userId);
  return count;
}

export function resetRefreshTokenStore() {
  refreshSessions.clear();
  userSessions.clear();
  userLastRefresh.clear();
}

export function getRefreshSession(sessionId) {
  return refreshSessions.get(sessionId) || null;
}