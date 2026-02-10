# `authorizeRole(roleOrArray)` middleware

## 1) Code complet

Fichier: `src/middlewares/authorizeRole.js`

- `authorizeRole('admin')` : autorise uniquement `admin`
- `authorizeRole(['admin', 'ops'])` : autorise si au moins un rôle correspond
- Retourne HTTP `403` si rôle insuffisant

## 2) Exemple d’utilisation (routes admin)

```js
import express from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { authorizeRole } from '../middlewares/authorizeRole.js';

const router = express.Router();

router.get('/admin/reports', authenticate, authorizeRole('admin'), handler);
router.get('/admin/audit-log', authenticate, authorizeRole(['admin', 'ops']), handler);
```

## 3) Exemple de réponse 403 claire

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Insufficient permissions"
  }
}
```