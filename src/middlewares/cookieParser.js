function decodeCookieValue(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function cookieParser(req, _res, next) {
  const header = req.get('cookie');
  const cookies = {};

  if (header) {
    const rawCookies = header.split(';');
    for (const rawCookie of rawCookies) {
      const [name, ...rest] = rawCookie.trim().split('=');
      if (!name) continue;
      const value = rest.join('=');
      cookies[name] = decodeCookieValue(value);
    }
  }

  req.cookies = cookies;
  next();
}

export default cookieParser;