# Modèle relationnel PostgreSQL (production-grade)

Ce document propose une base robuste pour migrer la persistance JSON vers PostgreSQL dans un backend Node.js/Express multi-utilisateur.

## 1) Diagramme logique (texte)

```text
users (1) ────────────────< carts (1) ────────────────< cart_items >─────────────── (1) products
  │                           (user_id FK, unique)         (cart_id FK, product_id FK)
  │
  ├───────────────< orders (N) ────────────────< order_items >─────────────── (1) products
  │                  (user_id FK)                 (order_id FK, product_id FK)
  │
  └───────────────< analytics_events (N)
                     (user_id FK nullable)

leads (table indépendante, sans FK)
```

## 2) Tables et contraintes clés

- **users**
  - PK UUID (`gen_random_uuid()`), email unique, rôle en enum (`admin`, `customer`).
- **products**
  - PK UUID, `price NUMERIC(12,2)`, `stock INTEGER`, `active BOOLEAN`.
  - Soft delete optionnel via `deleted_at TIMESTAMPTZ`.
- **carts**
  - PK UUID, FK `user_id -> users(id)` avec `ON DELETE CASCADE`.
  - Contrainte `UNIQUE(user_id)` pour un panier actif par utilisateur.
- **cart_items**
  - PK UUID, FK `cart_id -> carts(id)` (`ON DELETE CASCADE`),
  - FK `product_id -> products(id)` (`ON DELETE RESTRICT`).
  - Contrainte métier `UNIQUE(cart_id, product_id)`.
- **orders**
  - PK UUID, FK `user_id -> users(id)` (`ON DELETE RESTRICT` pour préserver l'historique).
  - Enum `order_status`: `pending`, `paid`, `shipped`, `cancelled`.
- **order_items**
  - PK UUID, FK `order_id -> orders(id)` (`ON DELETE CASCADE`),
  - FK `product_id -> products(id)` (`ON DELETE RESTRICT`),
  - `UNIQUE(order_id, product_id)`.
- **leads**
  - PK UUID, colonnes de capture simples (`name`, `email`, `message`, `created_at`).
- **analytics_events**
  - PK UUID, `event_type`, FK nullable `user_id -> users(id)` (`ON DELETE SET NULL`),
  - `payload JSONB` pour schéma flexible.

## 3) Justification des index

### Index indispensables

1. `users(email)` unique
   - Auth/login très fréquents, lookup direct par email.

2. `products(active, created_at DESC) WHERE deleted_at IS NULL`
   - Couvre listing catalogue des produits actifs + tri récence.
   - Le `partial index` évite de polluer l’index avec les lignes soft-delete.

3. `cart_items(cart_id)`
   - Accès principal lors du chargement de panier.

4. `orders(user_id, created_at DESC)`
   - Historique des commandes par utilisateur.

5. `orders(status, created_at DESC)`
   - Pilotage back-office (commandes par statut).

6. `analytics_events(event_type, created_at DESC)`
   - Exigence explicite + usage analytique standard (filtre type + période).

### Index complémentaires de scaling

7. `analytics_events(user_id, created_at DESC) WHERE user_id IS NOT NULL`
   - Parcours d’événements par utilisateur connecté.

8. `analytics_events USING GIN (payload)`
   - Recherche/filter JSONB (`payload @> ...`).

9. `products USING GIN (name gin_trgm_ops)`
   - Prépare une recherche textuelle rapide (autocomplete / fuzzy search).

10. `leads(created_at DESC)` et `leads(email)`
   - Exploitation CRM/export/filtrage temporel.

## 4) Stratégie transactionnelle

### Principes

- Utiliser **READ COMMITTED** par défaut.
- Encapsuler les opérations métier multi-tables dans des transactions SQL explicites.
- Gérer la concurrence avec `SELECT ... FOR UPDATE` sur les lignes `products` lors du checkout.

### Cas critique : checkout (panier -> commande)

Dans **une transaction unique** :

1. Lire les `cart_items` de l’utilisateur.
2. Verrouiller les produits concernés (`FOR UPDATE`) pour figer stock/prix au moment du paiement.
3. Valider stock disponible.
4. Créer `orders` (status `pending`/`paid` selon flow PSP).
5. Créer `order_items` avec `unit_price` snapshot.
6. Décrémenter `products.stock`.
7. Calculer et écrire `orders.total_amount`.
8. Vider le panier (ou archiver selon besoin).
9. Commit.

Si échec à une étape => rollback complet.

### Idempotence recommandée

- Ajouter une clé d’idempotence côté paiement (`payment_intent_id` unique en table dédiée, ou colonne unique dans `orders`) pour éviter les doublons en cas de retry réseau.

## 5) Recommandations performance et exploitation

1. **Migrations versionnées**
   - Adopter un outil (Prisma Migrate, Knex, Drizzle, Flyway, Liquibase).

2. **Pool de connexions**
   - Utiliser `pg` avec pool borné (ex: 10–30 selon CPU/traffic).

3. **Observabilité SQL**
   - Activer `pg_stat_statements`.
   - Monitorer les requêtes lentes (p95/p99), lock waits, dead tuples.

4. **Maintenance index/table**
   - `VACUUM (ANALYZE)` régulier (autovacuum ajusté).
   - Rebuild index ponctuel si bloat (REINDEX CONCURRENTLY).

5. **Partitionnement futur (analytics_events)**
   - Préparer un partitionnement mensuel par `created_at` si volumétrie forte.
   - Permet pruning + archivage peu coûteux.

6. **RLS (option multi-tenant renforcée)**
   - Si nécessaire, activer Row-Level Security pour forcer isolation applicative DB-side.

7. **Politique de suppression**
   - Produits : soft delete (`deleted_at`).
   - Commandes : conserver historique (pas de cascade destructive sur users/products).

8. **Cohérence montant**
   - Toujours stocker `order_items.unit_price` + `orders.total_amount` (snapshot immuable).

## 6) Livrables techniques ajoutés

- SQL complet: `db/postgres_schema.sql`
- Ce document d’architecture: `docs/postgresql-relational-model.md`