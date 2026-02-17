const ACCESS_COOKIE = 'insidex_access_token';
const REFRESH_COOKIE = 'insidex_refresh_token';

function parseCookieMaxAgeMs(value, fallbackMs) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackMs;
  }
  return parsed;
}

function cookieBaseOptions(overrides = {}) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    ...overrides,
  };
}

export function buildAccessCookieOptions() {
  return cookieBaseOptions({
    maxAge: parseCookieMaxAgeMs(process.env.JWT_ACCESS_COOKIE_MAX_AGE_MS, 15 * 60 * 1000),
  });
}

export function buildRefreshCookieOptions() {
  return cookieBaseOptions({
    maxAge: parseCookieMaxAgeMs(process.env.JWT_REFRESH_COOKIE_MAX_AGE_MS, 30 * 60 * 1000),
  });
}

export function setAuthCookies(res, { accessToken, refreshToken }) {
  if (accessToken) {
    res.cookie(ACCESS_COOKIE, accessToken, buildAccessCookieOptions());
  }

  if (refreshToken) {
    res.cookie(REFRESH_COOKIE, refreshToken, buildRefreshCookieOptions());
  }
}

export function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE, cookieBaseOptions());
  res.clearCookie(REFRESH_COOKIE, cookieBaseOptions());
}

function parseCookieHeader(cookieHeader) {
  if (!cookieHeader || typeof cookieHeader !== 'string') {
    return {};
  }

  return cookieHeader
    .split(';')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .reduce((acc, pair) => {
      const separatorIndex = pair.indexOf('=');
      if (separatorIndex <= 0) {
        return acc;
      }
      const key = pair.slice(0, separatorIndex).trim();
      const value = pair.slice(separatorIndex + 1).trim();
      if (!key) return acc;
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

export function readCookie(req, name) {
  if (req?.cookies && typeof req.cookies === 'object') {
    return req.cookies[name] || null;
  }

  const parsed = parseCookieHeader(req?.headers?.cookie);
  return parsed[name] || null;
}

export const authCookieNames = {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
};

export default {
  authCookieNames,
  setAuthCookies,
  clearAuthCookies,
  readCookie,
  buildAccessCookieOptions,
};