# Prisma + PostgreSQL setup (Express)

## 1) Installation commands

```bash
npm install prisma @prisma/client
npx prisma init
```

> Si `npx prisma init` est indisponible dans votre environnement CI/sandbox, la structure minimale peut être créée manuellement (ce dépôt inclut déjà `prisma/schema.prisma` et un seed minimal).

## 2) Environment configuration

- `DATABASE_URL` est lu depuis `.env` (aucun secret codé en dur).
- Exemple fourni dans `.env.example`.
- Paramètres de connexion recommandés inclus dans l’URL:
  - `connection_limit` (pool)
  - `pool_timeout`
  - `connect_timeout`
  - `sslmode` (configurable selon env)

## 3) Prisma scripts

Scripts ajoutés dans `package.json`:

- `npm run prisma:generate` → génère Prisma Client
- `npm run prisma:migrate` → `prisma migrate dev` (développement)
- `npm run prisma:migrate:deploy` → `prisma migrate deploy` (production)
- `npm run prisma:studio` → ouvre Prisma Studio
- `npm run prisma:seed` → exécute `prisma/seed.js`

## 4) `migrate dev` vs `migrate deploy`

- `prisma migrate dev`
  - Usage local/dev.
  - Crée de nouvelles migrations à partir des changements de `schema.prisma`.
  - Peut reset la base dans certains scénarios.
  - Peut déclencher automatiquement `prisma generate`.

- `prisma migrate deploy`
  - Usage prod/CI.
  - **N’invente pas** de migration: applique uniquement les migrations déjà versionnées dans `prisma/migrations`.
  - Plus sûr et déterministe pour la production.

## 5) Workflow recommandé

### Développement

1. Modifier `prisma/schema.prisma`
2. Créer migration: `npm run prisma:migrate -- --name <nom_migration>`
3. Générer client: `npm run prisma:generate`
4. Optionnel seed: `npm run prisma:seed`
5. Committer:
   - `prisma/schema.prisma`
   - dossier `prisma/migrations/*`

### Production

1. Injecter `DATABASE_URL` via secret manager / variable d’environnement.
2. Déployer le code avec migrations versionnées.
3. Lancer: `npm run prisma:migrate:deploy`
4. Vérifier healthchecks + logs applicatifs.

## 6) Gestion des migrations versionnées

- Versionner **toutes** les migrations dans Git.
- Interdire la création de migration en production.
- Revue PR obligatoire pour chaque migration SQL générée.
- En cas de rollback, créer une migration corrective explicite (éviter modifications manuelles non tracées).