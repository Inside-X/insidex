# Architecture cible — Authentification JWT + Autorisation par rôle (admin/customer)

## 1) Principes de séparation des responsabilités

- **Authentification** : vérifier l'identité via JWT (`verifyAccessToken`).
- **Autorisation** : vérifier les permissions/roles (`requireRole` / `requireAnyRole`).
- **Validation métier** : reste dans les handlers/controllers, pas dans les middlewares de sécurité.

Cette séparation permet des middlewares **réutilisables, testables, et composables**.

---

## 2) Middlewares à créer

## `authenticateJWT` (authentification)

### Rôle
- Lire `Authorization: Bearer <token>`.
- Vérifier la signature + expiration du token.
- Hydrater `req.auth` (ex: `sub`, `role`, `email`, `iat`, `exp`).
- Ne **jamais** mélanger avec la logique de rôle dans ce middleware.

### Contrat HTTP
- **401 Unauthorized** si :
  - header absent,
  - format invalide,
  - token invalide,
  - token expiré.

### Message d'erreur (standardisé)
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required"
  }
}
```

---

## `optionalAuthJWT` (authentification facultative)

### Rôle
- Tenter de parser/valider le token si présent.
- Si token valide : hydrate `req.auth`.
- Si token absent : laisser passer.
- Si token invalide : 401 (évite d’accepter un token malformé/suspect).

### Cas d’usage
- Routes publiques qui offrent des réponses enrichies si utilisateur connecté.

---

## `requireRole(...roles)` (autorisation)

### Rôle
- Vérifier que `req.auth` existe (donc middleware d’auth exécuté avant).
- Vérifier que `req.auth.role` appartient aux rôles autorisés.

### Contrat HTTP
- **401 Unauthorized** si `req.auth` absent (pas authentifié).
- **403 Forbidden** si authentifié mais rôle insuffisant.

### Message d'erreur (403)
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Insufficient permissions"
  }
}
```

---

## `errorHandler` (global)

### Rôle
- Capturer toutes les erreurs applicatives.
- Mapper vers une réponse JSON homogène.
- Éviter les leaks de stack en production.

### Recommandation
- Introduire des classes d’erreurs (`AppError`, `AuthError`, `ForbiddenError`, `ValidationError`) avec `status`, `code`, `message`.

---

## 3) Organisation recommandée des routes Express

## Arborescence

```txt
src/
  app.js
  routes/
    public.routes.js
    auth.routes.js
    admin.routes.js
    customer.routes.js
  middlewares/
    authenticate-jwt.js
    optional-auth-jwt.js
    require-role.js
    error-handler.js
  controllers/
    auth.controller.js
    admin.controller.js
    customer.controller.js
  services/
    token.service.js
    user.service.js
  errors/
    app-error.js
```

## Politique de montage

- **Public** (sans token) :
  - `GET /health`
  - `POST /auth/login`
  - `GET /products`
- **Privé authentifié** :
  - `GET /me` → `authenticateJWT`
- **Admin only** :
  - `GET /admin/users` → `authenticateJWT`, puis `requireRole('admin')`
- **Customer only (si nécessaire)** :
  - `GET /orders/my` → `authenticateJWT`, puis `requireRole('customer')`

Exemple de composition :

```js
router.get('/admin/users', authenticateJWT, requireRole('admin'), adminController.listUsers);
```

Important : routes publiques **non protégées** montées sans middleware d’auth obligatoire.

---

## 4) Structure d’erreurs et messages

## Format JSON unique

```json
{
  "error": {
    "code": "STRING_CONSTANT",
    "message": "Human readable message",
    "details": []
  }
}
```

## Mapping recommandé

- `401 UNAUTHORIZED`
  - `UNAUTHORIZED`
  - Message : `Authentication required` ou `Invalid/expired token`
- `403 FORBIDDEN`
  - `FORBIDDEN`
  - Message : `Insufficient permissions`
- `400 BAD_REQUEST`
  - `VALIDATION_ERROR`
- `404 NOT_FOUND`
  - `NOT_FOUND`
- `500 INTERNAL_SERVER_ERROR`
  - `INTERNAL_ERROR`

## Bonnes pratiques

- Pas d’informations sensibles dans les erreurs d’auth.
- Logs serveur détaillés, réponse client sobre.
- Inclure un `requestId` (corrélation) si disponible.

---

## 5) Tests à prévoir

## A. Tests unitaires middlewares

### `authenticateJWT`
- Retourne 401 si header absent.
- Retourne 401 si format non `Bearer`.
- Retourne 401 si token invalide/expiré.
- Passe au `next()` et set `req.auth` si token valide.

### `requireRole`
- Retourne 401 si `req.auth` absent.
- Retourne 403 si rôle non autorisé.
- Passe au `next()` si rôle autorisé.

### `optionalAuthJWT`
- Sans token : passe sans `req.auth`.
- Token valide : passe avec `req.auth`.
- Token invalide : 401.

## B. Tests d’intégration API (Supertest)

- Route publique accessible sans token (200).
- Route privée sans token (401).
- Route privée avec token invalide (401).
- Route admin avec token customer (403).
- Route admin avec token admin (200).
- Vérifier format d’erreur JSON homogène sur 401/403.

## C. Cas de robustesse

- Token expiré (clock skew éventuel).
- Header `Authorization` avec espaces/casse atypiques.
- Payload token sans `role` (doit échouer côté autorisation).

---

## 6) Recommandations sécurité (backend Node.js + PostgreSQL)

- Signer les JWT avec secret robuste (ou clé asymétrique) via variables d’environnement.
- Durée de vie courte pour `access token` (ex: 15 min).
- Gérer `refresh token` côté serveur (rotation + révocation) si besoin de sessions longues.
- Hasher les mots de passe avec Argon2 ou bcrypt (cost adapté).
- Limiter le brute force sur `/auth/login` (rate limit).
- Toujours utiliser HTTPS en production.

---

## 7) Résumé opérationnel

1. Créer `authenticateJWT` pour l’identité (401 si absent/invalide).
2. Créer `requireRole('admin')` pour les routes sensibles (403 si rôle insuffisant).
3. Monter les routes publiques sans middleware d’auth obligatoire.
4. Uniformiser les erreurs via `errorHandler`.
5. Couvrir unitaires + intégration pour garantir 401/403 corrects.