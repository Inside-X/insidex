# InsideX

InsideX est une application Node.js + Express avec front statique, authentification JWT, validation Zod, et persistance PostgreSQL via Prisma.

## Database architecture

- **ORM** : Prisma (`prisma/schema.prisma`).
- **Base** : PostgreSQL (`provider = "postgresql"`, `DATABASE_URL` via variables d’environnement).
- **Migrations versionnées** : `prisma/migrations/*` + `migration_lock.toml`.
- **Client DB partagé** : singleton `src/lib/prisma.js`.
- **Accès données** : couche repository (`src/repositories/*.repository.js`) sans logique métier embarquée.
- **Import legacy JSON -> DB** : `scripts/import-json-to-db.js`.

### Modèle relationnel (EPIC-1.4)

Entités couvertes :
- `User`
- `Product`
- `Cart`
- `CartItem`
- `Order`
- `OrderItem`
- `Lead`
- `AnalyticsEvent`

Points clés : UUID en PK, enums Prisma, contraintes FK, index de perf, JSONB pour payload analytics, decimal pour prix/montants.

## Setup dev (PostgreSQL + Prisma)

1. Installer les dépendances :
   ```bash
   npm install
   ```
2. Configurer la connexion DB dans `.env` :
   ```bash
   DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DBNAME?schema=public&connection_limit=10&pool_timeout=20&connect_timeout=10&sslmode=prefer"
   ```
3. Générer le client Prisma :
   ```bash
   npm run prisma:generate
   ```
4. Appliquer les migrations :
   ```bash
   npm run prisma:migrate
   ```
5. (Optionnel) Seed minimal :
   ```bash
   npm run prisma:seed
   ```
6. Démarrer l’app :
   ```bash
   npm start
   ```

## Vérifications EPIC-1.4

- Vérification structure/schema + dépendance JSON runtime + script d’import :
  ```bash
  npm run epic:1.4:verify
  ```
- Vérification intégration DB (create user/product/cart/order + FK):
  ```bash
  npm run db:verify:integration
  ```

## Migration des données legacy

- Dry-run :
  ```bash
  npm run db:import -- --dry-run
  ```
- Import réel :
  ```bash
  npm run db:import
  ```
## Tests & coverage

- Lancer la couverture Jest (gate inchangé côté seuils Jest `coverageThreshold`) :
  ```bash
  npm run test:coverage:jest
  ```
- Si le téléchargement des engines Prisma est bloqué (ex: restrictions CDN / erreur 403), utiliser `npm run test:coverage:jest` pour exécuter la couverture Jest de façon déterministe sans étape Prisma. Cette commande ne relâche pas les quality gates de couverture : elle utilise la même configuration Jest et les mêmes seuils globaux.

## Browser E2E (Playwright Chromium)

- Local :
  ```bash
  npm ci
  npm run prisma:generate
  npm run test:e2e:browser
  ```
- CI : job `e2e_browser` (workflow `.github/workflows/ci.yml`) exécute les mêmes étapes dans l'image officielle Playwright `mcr.microsoft.com/playwright:v1.58.2-jammy`.
- Gating : ce job est activé uniquement quand la variable de dépôt/environnement `CI_GATING_PROFILE` vaut `prod-payments` (sinon il reste défini et lançable via `workflow_dispatch` sans bloquer les flux dev).


## Local dev prerequisites (catalogue / EPIC-5)

- Start local Redis (required for redis-backed mode in dev):
  ```bash
  redis-server --port 6379
  ```

- Use explicit dev mode to avoid accidental production fail-closed behavior:
  ```bash
  npm run start:dev
  ```
  This command sets `NODE_ENV=development` (cross-platform via `cross-env`) and loads `.env` through `server.dev.js` (`dotenv/config`).

- Minimal `.env` values for local catalogue browsing:
  ```bash
  NODE_ENV=development
  REDIS_URL=redis://127.0.0.1:6379
  DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME?schema=public
  CORS_ORIGIN=http://127.0.0.1:3000,http://localhost:3000
  ```

- Expected rate-limit behavior:
  - `NODE_ENV=production`: backend failure remains strict fail-closed (`503 RATE_LIMIT_BACKEND_UNAVAILABLE`).
  - `NODE_ENV=development`: backend failure uses deterministic dev fallback and emits `X-RateLimit-Mode: dev_fallback`.


- Quick smoke checks:
  ```bash
  curl -sS http://127.0.0.1:3000/healthz
  curl -sS http://127.0.0.1:3000/api/products
  ```
  In development with redis backend unavailable, responses must not fail with `RATE_LIMIT_BACKEND_UNAVAILABLE` and should expose `X-RateLimit-Mode: dev_fallback`.

## Catalogue V1 seed & smoke proof (EPIC-5.1C)

- Seed catalogue déterministe (idempotent, non destructif) :
  ```bash
  npm run prisma:seed
  ```
  - Comportement : n'insère le dataset V1 que si le catalogue est vide.
  - Forçage explicite (toujours via upsert, sans duplication) :
  ```bash
  SEED_FORCE=1 npm run prisma:seed
  ```

- Smoke proof catalogue (Node/supertest, sans navigateur) :
  ```bash
  npm run smoke:catalogue:v1
  ```
  - Génère un artefact JSON :
    `docs/audit/artifacts/epic5_catalogue_smoke_proof.<sha8>.json`

- CI optionnelle : job `catalogue_smoke` dans `.github/workflows/ci.yml`, activé uniquement si `CI_GATING_PROFILE=catalogue`.