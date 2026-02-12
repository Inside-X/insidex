# Import JSON legacy -> PostgreSQL (Prisma)

## Commandes

```bash
npm run db:import -- --dry-run
npm run db:import
```

## Ce que fait le script

- Lit les fichiers legacy dans `data/*.json` (`users`, `products`, `carts`, `leads`, `analytics`, `orders` si présent).
- Transforme les objets vers le format Prisma.
- Génère des UUID compatibles pour les anciennes clés non-UUID.
- Respecte l’ordre FK via transaction globale (users/products avant carts/orders/items).
- Gère les conflits email (skip + log masqué).
- Conserve `passwordHash` tel quel (pas de re-hash).
- Fournit un rapport de fin avec vérification de cohérence (`expected` vs `inserted`).

## Exemple de log final

```json
{
  "dryRun": false,
  "durationMs": 142,
  "expected": {
    "users": 12,
    "products": 40,
    "carts": 8,
    "cartItems": 19,
    "orders": 5,
    "orderItems": 12,
    "leads": 21,
    "analyticsEvents": 250
  },
  "inserted": {
    "users": 10,
    "products": 40,
    "carts": 8,
    "cartItems": 19,
    "orders": 5,
    "orderItems": 12,
    "leads": 21,
    "analyticsEvents": 250
  },
  "duplicateEmailInJson": 1,
  "usersSkippedBecauseEmailExistsInDb": 1,
  "match": {
    "users": true,
    "products": true,
    "carts": true,
    "cartItems": true,
    "orders": true,
    "orderItems": true,
    "leads": true,
    "analyticsEvents": true
  }
}
```