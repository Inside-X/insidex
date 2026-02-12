# Audit EPIC-1 (backend Node.js production-ready)

## Portée auditée
- Code backend runtime : `src/**`, `server.js`.
- Schéma DB : `prisma/schema.prisma`, `db/postgres_schema.sql`.
- Validation et sécurité : middlewares JWT/RBAC/Zod.
- Tests : `tests/**`, `jest.config.js`.

## 1) Problèmes critiques (blockers EPIC-2)

1. **Intégration PostgreSQL non opérationnelle dans l'environnement actuel**
   - Le test d'intégration DB échoue car la base PostgreSQL n'est pas accessible (`localhost:5432`) ; cela bloque la validation E2E EPIC-1.4.
2. **Migrations Prisma versionnées absentes/incomplètes**
   - Le script de vérification EPIC-1.4 signale l'absence de migrations versionnées.
3. **Architecture incomplète par rapport au périmètre annoncé**
   - Le backend runtime expose seulement des routes de santé/admin d'exemple ; les endpoints métier critiques (`auth`, `cart`, `products`, `leads`) ne sont pas montés dans `src/app.js`.

## 2) Correctifs appliqués pendant audit

1. **JWT auth : correction d'un appel erroné**
   - Correction de l'appel `unauthorized(...)` pour retourner un 401 cohérent quand le token est sans `sub/id`.
2. **RBAC role middleware plus robuste**
   - Normalisation de rôle côté middleware alignée avec la policy centrale, sans crash si rôle manquant.
3. **Validation payload renforcée**
   - Rejet explicite des payloads non-JSON (`Content-Type` invalide) avec erreur de validation claire.
4. **Validation `productId` panier durcie**
   - Suppression du fallback trop permissif basé uniquement sur longueur minimale, remplacement par format alphanumérique borné.

## 3) Améliorations recommandées

- Monter réellement dans `src/app.js` les routes métier validées (auth/products/cart/leads), sinon EPIC-1 n'est validé qu'au niveau des tests unitaires, pas du runtime.
- Ajouter/commiter les migrations Prisma (`prisma/migrations/**`) et verrouiller un workflow `prisma migrate deploy` CI.
- Exclure les tests d'intégration DB quand `DATABASE_URL` est placeholder ou inaccessible (healthcheck préalable + `describe.skip`).
- Compléter la couverture de branches/fonctions pour `src/validation/**` afin de passer les seuils `jest.config.js`.
- Garder la logique de privilèges côté front strictement cosmétique ; toute autorisation doit rester server-side (déjà vrai sur les routes admin runtime).

## 4) Score global de maturité EPIC-1

**6.5 / 10**

- **+** JWT/RBAC middleware présents, centralisation d'erreurs, schémas Zod stricts, modèle Prisma cohérent.
- **-** Runtime backend trop partiel vs périmètre EPIC, migrations manquantes, intégration DB non validée en CI locale, couverture validation sous seuil demandé.