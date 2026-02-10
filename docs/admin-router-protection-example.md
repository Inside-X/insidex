# Exemple d’organisation Express pour protéger `/api/admin`

## `src/app.js`
- Déclare une route publique non protégée : `GET /api/health`
- Monte le router admin sous `/api/admin`

## `src/routes/admin.routes.js`
- Applique automatiquement `authenticate` + `authorizeRole('admin')` à tout le router via:

```js
adminRouter.use(authenticate, authorizeRole('admin'));
```

- Expose une route admin de démo : `GET /api/admin/health`