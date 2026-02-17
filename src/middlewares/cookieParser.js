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

export function cookieParserMiddleware(req, _res, next) {
  req.cookies = parseCookieHeader(req.headers?.cookie);
  return next();
}

export default cookieParserMiddleware;