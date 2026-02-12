# EPIC-1.4 — Checklist de validation finale

## 1) Tests d’intégration (PostgreSQL)

Couverture demandée :
- [x] Create user
- [x] Create product
- [x] Add cart item
- [x] Create order transaction
- [x] FK respectées (test d’échec attendu sur `productId` invalide)

Implémentations :
- Test Jest : `tests/integration/postgres.integration.test.js`
- Script exécutable CI/CD : `scripts/verify-db-integration.js`

## 2) Vérifications de migration

- [x] Plus aucun accès JSON persistant dans le runtime backend (`src/**`, `server.js`)
- [x] Migrations versionnées présentes (`prisma/migrations/*`)
- [x] Schéma Prisma stable et complet (`prisma/schema.prisma`)
- [x] Script d’import legacy disponible (`scripts/import-json-to-db.js`)

Automatisation :
- `npm run epic:1.4:verify`

## 3) Nettoyage legacy

- [x] Dossier legacy `data/json` supprimé / absent
- [x] Fichier legacy `app.js` supprimé

## 4) Documentation

- [x] Section README “Database architecture”
- [x] Instructions setup dev PostgreSQL + Prisma

---

## Script npm de vérification

```bash
npm run epic:1.4:verify
npm run db:verify:integration
```

---

## Instructions de déploiement production (PostgreSQL + Prisma)

1. **Configurer les variables d’environnement**
   - `DATABASE_URL` pointant vers PostgreSQL prod (TLS/SSL selon infra)
   - Secrets JWT/APP hors dépôt (vault/secret manager)

2. **Build / install dépendances**
   ```bash
   npm ci
   npm run prisma:generate
   ```

3. **Appliquer migrations versionnées en prod**
   ```bash
   npm run prisma:migrate:deploy
   ```

4. **(Optionnel) Migration des données legacy**
   - Pré-check :
     ```bash
     npm run db:import -- --dry-run
     ```
   - Exécution réelle :
     ```bash
     npm run db:import
     ```

5. **Smoke checks post-déploiement**
   ```bash
   npm run epic:1.4:verify
   npm run db:verify:integration
   ```

6. **Démarrage application**
   ```bash
   npm start
   ```

## Notes d’exploitation

- Exécuter `prisma migrate deploy` uniquement en production (jamais `migrate dev`).
- Sauvegarder la base avant migration/import.
- Superviser erreurs Prisma et saturation pool via logs applicatifs.