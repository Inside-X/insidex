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