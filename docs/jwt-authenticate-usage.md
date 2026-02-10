# JWT authenticate middleware usage

## 1) Middleware

File: `src/middlewares/authenticate.js`

- Reads `Authorization: Bearer <token>`
- Verifies signature and expiration with `jsonwebtoken`
- Attaches authenticated identity to `req.user` with:
  - `id` (from `sub` or `id` in payload)
  - `role`
- Returns `401` when token is missing or invalid

## 2) Expected JWT payload

```json
{
  "sub": "user_123",
  "role": "admin",
  "iat": 1710000000,
  "exp": 1710000900
}
```

Minimal required claims for the middleware:
- `sub` (or `id`)
- `role`

## 3) How to generate the token

```js
import jwt from 'jsonwebtoken';

const payload = {
  sub: user.id,
  role: user.role,
};

const token = jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
  expiresIn: '15m',
});
```

## 4) Example route usage

```js
import express from 'express';
import { authenticate } from '../middlewares/authenticate.js';

const router = express.Router();

router.get('/admin/reports', authenticate, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Insufficient permissions',
      },
    });
  }

  return res.json({ data: 'ok' });
});
```

## 5) Error responses

### Missing token
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required"
  }
}
```

### Invalid token format
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authorization header must be in the format: Bearer <token>"
  }
}
```

### Expired token
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Token expired"
  }
}
```

### Invalid token
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid token"
  }
}
```