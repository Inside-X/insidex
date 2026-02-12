# Audit EPIC-1 — Analyse complète des flux backend (Node.js)

## Méthode et périmètre vérifié
Audit statique + tests existants, sans hypothèses fonctionnelles hors code.

Périmètre inspecté :
- Runtime backend : `src/app.js`, `src/routes/**`, `src/middlewares/**`, `src/security/**`, `src/utils/**`.
- Validation : `src/validation/**`.
- DB : `prisma/schema.prisma`, `src/repositories/**`, scripts DB.
- Tests : `tests/**`, `jest.config.js`.
- Front (uniquement pour détecter contournements de rôle) : `js/modules/**`.

---

## Diagramme simplifié des flux (état réel du repository)

```text
[Client]
   |
   +--> GET /api/health -------------------------------> [Public route, no auth]
   |
   +--> GET /api/admin/health --------------------------> authenticate -> requirePermission -> handler
   |
   +--> GET /api/admin/reports -------------------------> authenticate -> requirePermission -> handler
   |
   +--> GET /api/admin/audit-log -----------------------> authenticate -> requirePermission -> handler
   |
   +--> /api/auth/*, /api/products, /api/cart, /api/orders, /api/leads
         (référencés côté front/tests, mais non montés dans src/app.js au runtime)
```

Conclusion structurante : les flux métier demandés (inscription/login/produit/panier/order/lead) ne sont **pas exposés** par le serveur Express runtime actuel.

---

## Analyse détaillée par flux demandé

## 1) Flux Inscription
### 1.1 Cohérence auth
- Pas de route runtime `POST /api/auth/register` montée dans `src/app.js`.
- Des schémas Zod existent (`authSchemas.register`) et des tests existent, mais sur app de test dédiée (`buildValidationTestApp`), pas sur le runtime prod.

### 1.2 Validation payload
- Schéma strict présent (`.strict()`), validation email/password/role.
- Injection de champ en trop prévue/contrée dans les tests de validation.

### 1.3 Intégrité DB
- Référentiel `User` prêt (email unique, role enum), mais aucun contrôleur runtime ne relie ce flux à la DB.

### 1.4 Gestion d’erreurs
- Middleware d’erreur global présent.
- Mais flux non monté en prod => non testable en bout-en-bout runtime.

### 1.5 Utilisateur malveillant (simulations demandées)
- Non authentifié : N/A (pas de route).
- Rôle incorrect : N/A (pas de route).
- Payload malformé/champ en trop/injection admin : protégé au niveau schéma de test, pas au runtime prod.

**Risque restant** : faux sentiment de couverture sécurité car validation démontrée surtout en tests, pas via endpoints runtime.

---

## 2) Flux Login
Même constat que l’inscription : schémas et tests présents, mais pas de route runtime montée.

- Auth : N/A runtime.
- Validation : `authSchemas.login` strict.
- DB : pas de service/controller runtime observable.
- Erreurs : gérées en théorie par middleware global.
- Simulations malveillantes : couvertes en tests validation, pas en HTTP runtime.

**Risque restant** : absence de vérification réelle JWT issuance/refresh/logout côté serveur runtime.

---

## 3) Flux Accès Admin
### 3.1 Cohérence auth
- Route protégée correctement via `authenticate` + `requirePermission`.
- Vérification JWT avec algo explicitement restreint `HS256`, et options issuer/audience quand configurés.

### 3.2 Validation payload
- Flux GET (pas de body critique).

### 3.3 Intégrité DB
- Pas d’accès DB sur endpoints admin actuels (health/messages).

### 3.4 Gestion d’erreurs
- 401/403 structurés via `sendApiError`.
- Correction apportée : token sans `sub/id` renvoie désormais 401 uniforme.

### 3.5 Utilisateur malveillant (simulations)
- Non authentifié -> 401.
- Rôle incorrect -> 403.
- Token invalide/expiré -> 401 (tests présents).
- Champ en trop/injection admin -> non applicable à ces GET.

**Risque restant** : couverture limitée à des routes d’exemple, pas à des routes admin métier (produits/leads/orders admin, etc.).

---

## 4) Flux Création Produit
- Route runtime `POST /api/products` absente.
- Schéma `productsSchemas.create` strict existe (nom, description, price, stock, active).
- Test de validation existe sur app de test, avec contrôle rôle `admin` dans ce harness.

**Risques restants** :
- Pas de preuve runtime que la création produit est protégée par auth + RBAC + validation avant DB.
- Pas de preuve runtime de gestion transactionnelle/erreurs métier liées au produit.

---

## 5) Flux Ajout Panier
- Route runtime absente.
- Schéma `cartSchemas.add` strict existe, avec durcissement `productId` (UUID ou alphanum borné).

Simulations sécurité (au niveau validation/harness) :
- payload malformé : rejet prévu.
- champ en trop : rejet via `.strict()`.
- injection champ admin : rejet via `.strict()`.

**Risque restant** : aucune garantie runtime que la validation précède un accès DB sur `/api/cart/*` (route non montée).

---

## 6) Flux Création Order
- Aucune route runtime `/api/orders` observée.
- Repository DB existe avec transaction `createWithItemsAndUpdateStock`.

Points positifs DB :
- Transaction atomique création commande + items + décrément stock.
- Contrôles métier minimum (produit inexistant, stock insuffisant).

Points faibles :
- Logique métier non triviale dans repository (contrôles stock + total) : mélange persistance/métier.
- Pas de couche service/contrôleur runtime observable exposant ce flux.

---

## 7) Flux Création Lead
- Route runtime `POST /api/leads` absente.
- Schéma `leadsSchemas.create` strict présent.

**Risque restant** : front appelle `/api/leads` mais backend runtime ne l’expose pas ; risque d’écart fort entre UX/front et backend réel.

---

## Simulations demandées (synthèse globale)

| Simulation | État constaté |
|---|---|
| User non authentifié | Correctement bloqué pour routes admin existantes (401). |
| User rôle incorrect | Correctement bloqué pour routes admin existantes (403). |
| Payload malformé | Couvert dans tests validation (harness), pas prouvé runtime pour flux métier absents. |
| Champ en trop | Couvert par `.strict()` dans schémas, idem limitation runtime. |
| Injection de champ admin | Couvert par `.strict()` dans schémas auth/cart/etc., mais pas exercé sur endpoints runtime métier (absents). |

---

## Points faibles / incohérences logiques

1. **Incohérence majeure architecture vs EPIC annoncé**
   - Les flux métier annoncés sont surtout représentés dans le front + schémas + tests, mais pas exposés en routes runtime backend.

2. **Validation “forte” surtout théorique côté prod**
   - Bonne qualité des schémas Zod, mais ils ne protègent réellement que les endpoints effectivement montés.

3. **Intégration DB non validée en environnement de test courant**
   - Tests et scripts DB échouent faute de connectivité PostgreSQL locale.

4. **Migrations versionnées absentes/incomplètes**
   - Le check EPIC-1.4 échoue explicitement.

5. **Séparation des couches incomplète**
   - Repositories majoritairement clean, mais `order.repository` embarque logique métier (stock/prix/contrôles).

---

## Risques sécurité restants (priorisés)

### Critiques
1. **Surface métier non implémentée côté backend runtime**
   - Les contrôles auth/validation/RBAC ne peuvent pas être garantis en prod sur les flux métier non montés.

2. **Risque de dérive front-only sur rôles admin**
   - Le front masque/affiche UI admin via `authState.role`, mais cela n’est pas une barrière sécurité ; sans endpoints serveur complets protégés, risque d’interprétation erronée côté équipe.

### Élevés
3. **Absence de preuve E2E DB/migrations en CI locale**
   - Forte probabilité de régression silencieuse au déploiement.

4. **Coverage validation insuffisante au seuil configuré**
   - Les branches/fonctions validation ne passent pas les seuils imposés.

---

## Recommandations actionnables (ordre de priorité)

1. **Monter les routes runtime manquantes** (`/api/auth`, `/api/products`, `/api/cart`, `/api/orders`, `/api/leads`) avec pipeline strict :
   `requestContext -> validate(Zod strict) -> authenticate -> requirePermission/authorizeRole -> controller -> service -> repository`.

2. **Versionner toutes les migrations Prisma** et rendre bloquant en CI :
   - `prisma migrate deploy` + vérif présence `prisma/migrations/*`.

3. **Rendre les tests DB robustes à l’environnement**
   - skip explicite si DB inaccessible, ou provision DB de test en CI.

4. **Sortir la logique métier de `order.repository` vers une couche service**
   - repository = persistance pure.

5. **Conserver la règle : rôle/admin validé uniquement serveur**
   - front = UX, jamais autorisation.

---

## Score de maturité EPIC-1 (révisé)

**5.8 / 10**

- **Forces** : middleware auth/RBAC corrects sur routes existantes, schémas Zod stricts bien construits, schéma Prisma solide.
- **Faiblesses structurelles** : flux métier non exposés en runtime, migrations non verrouillées, intégration DB non validée, couverture validation sous objectifs.


---

## Vérification avant EPIC-2 (paiement réel)

### 1) Checklist validée / non validée

#### Sécurité
- [ ] **Helmet activé** — **NON VALIDÉ** (aucun `helmet()` monté dans l’app).
- [ ] **CORS configuré proprement** — **NON VALIDÉ** (aucun middleware CORS explicite).
- [ ] **Rate limiting présent** — **PARTIEL / NON VALIDÉ runtime** (`authRateLimiter` existe mais n’est pas monté).
- [ ] **Logs non verbeux en prod** — **PARTIEL** (réponses client non verbeuses OK, mais logs serveur `console.*` restent détaillés sans stratégie de niveau par environnement).
- [ ] **Variables sensibles via .env uniquement** — **PARTIEL** (`JWT_ACCESS_SECRET` lu via env côté runtime, mais `.env` versionné et ne contient pas les secrets JWT requis ; il faut sécuriser la stratégie secrets globale).

#### Base de données
- [x] **Transactions utilisées quand nécessaire** — **VALIDÉ partiellement** (transaction présente sur création de commande + stock).
- [~] **Contraintes DB alignées avec validation Zod** — **PARTIEL** (bonne base FK/index/uniques, mais alignement incomplet sur certaines bornes métier validées côté Zod).
- [x] **Gestion erreurs DB propre** — **VALIDÉ partiellement** (normalisation Prisma -> erreurs applicatives, mais logs DB peuvent rester verbeux).

#### Performance
- [~] **Pas de N+1 queries** — **PARTIEL** (pas de N+1 évident en lecture list, mais boucle d’updates stock par item dans transaction order = coût linéaire).
- [x] **Index sur colonnes utilisées en WHERE** — **GLOBALLEMENT VALIDÉ** (email, FKs, status/date, etc.).
- [x] **Pagination sur endpoints list** — **VALIDÉ au niveau repository** (`skip/take` présents sur `list`).

#### Robustesse
- [~] **Aucun throw non catché** — **PARTIEL** (repository catchent DB; des `throw` existent dans transactions puis sont normalisés, mais pas de couverture runtime complète des flux métier).
- [x] **Middleware error central** — **VALIDÉ** (`errorHandler` global en fin de pipeline).
- [~] **Status HTTP cohérents** — **PARTIEL** (cohérent sur admin/auth middleware ; non vérifiable bout-en-bout sur flux métier non montés).

### 2) Correctifs nécessaires (priorité EPIC-2)

1. **Ajouter les middlewares sécurité de base au runtime** :
   - `helmet()` global,
   - CORS strict par origin/method/header via env,
   - rate limiting monté réellement (au moins auth + endpoints sensibles).
2. **Finaliser la gouvernance secrets** :
   - secrets JWT requis en prod via secret manager/variables d’environnement,
   - `.env` local uniquement non sensible, `.env.example` documenté,
   - fail-fast au boot si secret critique absent.
3. **Compléter le backend runtime des flux métier** (`/api/auth`, `/api/products`, `/api/cart`, `/api/orders`, `/api/leads`) avant paiement réel.
4. **Réduire la verbosité des logs en prod** :
   - logger structuré avec niveaux,
   - masking/redaction systématique des champs sensibles,
   - pas de stack brute en production.
5. **Durcir performance/order path** :
   - limiter les updates unitaires en boucle si volumétrie augmente,
   - valider plan d’index sur vraies requêtes prod,
   - garder pagination/API contract sur toutes routes list runtime.
6. **Verrouiller CI qualité** :
   - migrations versionnées obligatoires,
   - tests intégration DB exécutables (DB de test provisionnée),
   - seuils coverage validation respectés.

### 3) Niveau de sécurité avant paiement

**Niveau actuel : MOYEN (insuffisant pour “production ready paiement réel”).**

Justification :
- points positifs sur JWT/RBAC/erreurs/DB schema,
- mais manque des fondations sécurité runtime (Helmet/CORS/rate-limiter montés),
- flux métier critiques pas complètement exposés et validés en bout-en-bout,
- CI DB/migrations/coverage encore non stabilisée.
