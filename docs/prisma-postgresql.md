# Prisma + PostgreSQL (Express)

## Commandes principales

- `npm run prisma:generate` : génère le client Prisma à partir de `prisma/schema.prisma`.
- `npm run prisma:migrate` : crée et applique une migration **en développement** (`prisma migrate dev`).
- `npm run prisma:studio` : ouvre Prisma Studio pour explorer les données.
- `npm run prisma:seed` : exécute le seed minimal (`prisma/seed.js`).

## `migrate dev` vs `migrate deploy`

- `prisma migrate dev`
  - usage **local/dev**
  - détecte les changements de schéma
  - crée de nouveaux fichiers de migration versionnés
  - applique la migration sur la base de dev
  - peut déclencher le seed en dev

- `prisma migrate deploy`
  - usage **production/CI-CD**
  - n'invente pas de nouvelles migrations
  - applique strictement les migrations déjà versionnées dans `prisma/migrations`
  - commande sûre pour des déploiements reproductibles

## Workflow recommandé

### Développement
1. Modifier `prisma/schema.prisma`.
2. Lancer `npm run prisma:migrate` pour générer + appliquer la migration.
3. Lancer `npm run prisma:generate` si nécessaire.
4. Lancer `npm run prisma:seed` si besoin de données de départ.

### Production
1. Committer les migrations générées (`prisma/migrations/*`).
2. Déployer l'application avec les variables d'environnement (`DATABASE_URL`) injectées par la plateforme.
3. Exécuter `npx prisma migrate deploy` au démarrage release/CI.
4. Exécuter le seed uniquement si le process de release le nécessite.

## Migrations versionnées

- Les migrations Prisma sont des dossiers horodatés dans `prisma/migrations`.
- Elles doivent être commit en Git pour conserver l'historique DB.
- Chaque environnement applique le même historique, garantissant la cohérence entre dev, staging et prod.