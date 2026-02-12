# Audit complet EPIC-1 — niveau production SaaS

## Scope audité
- Runtime API Express (routes réellement montées).
- Sécurité middleware JWT/RBAC/CORS/headers/errors.
- Validation Zod.
- Migration PostgreSQL + repositories Prisma.
- Suite de tests existante.

## Résultat synthétique

### Blockers EPIC-2
1. Les endpoints métier attendus côté frontend (`/api/auth/*`, `/api/leads`, `/api/analytics/*`, etc.) ne sont pas montés dans l'app runtime.
2. La couverture de validation échoue encore les seuils configurés (`npm run test:coverage`).
3. Le rate limiting auth existe mais n'est monté sur aucun endpoint runtime.

### Points solides
- JWT vérifié avec algorithme explicitement restreint (`HS256`) + issuer/audience conditionnels.
- RBAC serveur appliqué sur les endpoints admin exposés.
- Schémas Zod stricts présents pour auth/products/cart/leads.
- Schéma Prisma relationnel solide (FK, index, uniques, transactions).

## Patchs recommandés immédiats

### A. Monter réellement les routes métier (auth/leads/analytics/products/cart/orders)
Brancher des routeurs runtime dans `src/app.js` avec pipeline strict:
`requestContext -> validate -> authenticate -> requirePermission/authorizeRole -> controller -> service -> repository`.

### B. Activer rate limiting sur endpoints auth
Monter `authRateLimiter` sur `/api/auth/login`, `/api/auth/register`, `/api/auth/refresh`, `/api/auth/forgot`, `/api/auth/reset`.

### C. Ajouter tests runtime réels (pas seulement test harness)
Tester en supertest les routes runtime POST/PUT/PATCH critiques avec payload invalides + champs inconnus + 400.
