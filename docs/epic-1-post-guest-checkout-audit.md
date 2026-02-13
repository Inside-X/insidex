# Audit EPIC-1 (post guest checkout)

Date: 2026-02-13  
Périmètre: API auth, checkout invité, commandes, paiements, validation, middlewares, Prisma, tests runtime.

## Méthodologie

Commandes exécutées:

- `npm run test:coverage`
- `NODE_OPTIONS=--experimental-vm-modules node ./node_modules/jest/bin/jest.js --runInBand --reporters=default`

Résultats clefs observés:

- Couverture statements globale: **91.35%** (objectif runtime >90 atteint).
- Le run complet échoue (2 suites KO), donc la readiness EPIC-2 est bloquée.

---

## 1) Sécurité

### JWT, RBAC, `isGuest`

✅ Points solides:

- Vérification JWT contrainte à `HS256`, support `issuer`/`audience`, rejet des payloads sans `sub`.  
- Le contexte auth inclut `sub`, `role`, `isGuest` (booléen explicite), avec un fallback legacy `req.user`.  
- RBAC centralisé (`normalizeRole`, permissions mappées, middlewares `authorizeRole` + `requirePermission`).
- Guest checkout: injection contrôlée d’un JWT implicite court (10m), puis passage par le middleware d’auth standard.

⚠️ Risques / écarts:

- Le secret JWT n’est pas validé au boot (validation uniquement à la requête). En cas de mauvaise config, l’API répond 500 runtime.
- L’erreur interne peut remonter des messages techniques côté client si l’exception n’est pas un `AppError` (cf. handler global).

### Endpoints sensibles auth/orders

✅

- `/api/orders` est protégé par: validation stricte → guest identity → auth → role `customer` → contrôle identité checkout/ownership.
- Endpoints admin protégés auth+RBAC.

❌ Blocker critique:

- Dans `POST /api/orders`, `result` est utilisé avant son initialisation (`ReferenceError`), ce qui casse le flux de création de commande à l’exécution.

### Headers, CORS, error handler

✅

- Security headers présents (CSP, COOP, CORP, frame deny, nosniff, etc.).
- CORS empêche wildcard en production et renvoie 403 si origin non whitelisté.
- Error handler unifié avec `requestId` et logs serveur.

⚠️

- CORS: quand la liste est fournie, `Access-Control-Allow-Origin` est fixé à `origin` sans fallback explicite pour requêtes serveur-to-serveur (acceptable mais à documenter).

---

## 2) Validation

### Zod strict sur endpoints mutables

✅

- Les schémas mutables sont majoritairement `z.object(...).strict(...)` (auth, cart, leads, orders, payments, produits).
- Les endpoints critiques checkout/paiement/webhooks/orders utilisent `strictValidate`.

⚠️ Écart de conformité stricte (process)

- Plusieurs routes mutables passent par `validate(...)` au lieu de `strictValidate(...)` (auth/cart/leads/products/analytics).  
  Même si les schémas sont stricts, la contrainte d’architecture demandée "strict middleware partout sur mutable" n’est pas uniformément appliquée.

### Payload invalide → 400

✅

- `strictValidate` renvoie directement 400 `VALIDATION_ERROR`.
- `validate` transforme `ZodError` en `ValidationError` puis handler -> 400.

---

## 3) Idempotency et stock

✅

- Idempotency key unique côté Prisma (`Order.idempotencyKey @unique`) + gestion de replay sur `P2002`.
- Réservation de stock via transaction Prisma atomique (`$transaction`) + décrément conditionnel `stock >= quantity`.
- Webhook events idempotents (`PaymentWebhookEvent.eventId @unique`) avec replay-safe.

⚠️

- Le modèle n’impose pas une clé d’idempotence "scope user + action"; une clé globale unique peut compliquer certains scénarios multi-clients si la génération client est faible.

---

## 4) Paiement

✅

- Flux `create-intent` calcule le montant depuis les prix DB (pas depuis le client).
- Metadata payment contient `orderId`, `userId`, `idempotencyKey` puis vérification croisée côté repository (`markPaidFromWebhook`).

⚠️ Risques importants

- Stripe webhook: vérification HMAC faite sur `JSON.stringify(req.body)` et non le **raw body signé**; fragile face aux différences de sérialisation.
- PayPal webhook: absence de vérification de signature/provider proof (seulement cohérence `orderId`/metadata).

Ces deux points sont des **faiblesses sécurité paiement** avant montée en charge.

---

## 5) Tests

## Couverture

✅

- Couverture runtime statements globale observée: **91.35%**.

❌ Stabilité suite

- Le run complet échoue:
  - `tests/integration/guest-checkout.runtime.e2e.test.js` échoue à cause du bug runtime `result` non initialisé dans `orders.routes.js`.
  - `tests/integration/runtime.routes.test.js` ne parse pas (virgule en trop dans le test, syntax error), ce qui masque une partie de la validation continue.

### Exigences 429/403/400/200, concurrence

✅ partiel

- La suite couvre explicitement ces statuts et des scénarios de concurrence/idempotence (dont tests fintech audit repo).

❌ mais non "green"

- Tant que les 2 pannes ci-dessus ne sont pas corrigées, la matrice de conformité test ne peut pas être considérée validée en CI.

---

## 6) Architecture

### Montage des routes et pipeline middleware

✅

- Ordre global app cohérent: security headers → CORS → JSON parser → request context/logger → rate limit `/api` → routers → error handler.
- Le pipeline cible est bien matérialisé sur checkout critique (`validate -> auth -> RBAC -> controller -> repo`).

⚠️

- Hétérogénéité des middlewares de validation (`validate` vs `strictValidate`) sur endpoints mutables hors checkout.
- `orders.routes.js` contient une régression de contrôle (initialisation de variable), indiquant un manque de garde qualité sur code path critique.

### Migration Prisma et stabilité

✅

- Migrations versionnées présentes pour idempotency paiement et guest checkout.
- Le schéma Prisma formalise correctement contraintes d’unicité, FK, enums et index utiles.

### Logs prod

✅

- Niveau de logs dépend de `NODE_ENV`/`LOG_LEVEL`; en prod, défaut `info` raisonnable.

⚠️

- Les erreurs DB sont envoyées sur `console.error` systématiquement, y compris les 4xx attendues (bruit potentiel en prod si trafic fort).

---

## 7) Verdict final

## Scorecard

- **Sécurité**: **7.5 / 10**
- **Validation**: **8.0 / 10**
- **Architecture**: **7.5 / 10**
- **Production readiness (EPIC-1)**: **6.5 / 10**

### Blockers avant EPIC-2

1. **Bloquant fonctionnel**: corriger `POST /api/orders` (`result` utilisé avant déclaration).  
2. **Bloquant qualité**: corriger le test cassé `runtime.routes.test.js` (syntax error), puis rerun full suite green.  
3. **Bloquant sécurité paiement**: implémenter vérification webhook robuste (Stripe raw body + signature provider, PayPal verification officielle).

### Recommandations robustesse (ordre prioritaire)

1. Standardiser tous les endpoints mutables sur `strictValidate` + format d’erreur unique 400.
2. Introduire validation de config au boot (JWT/CORS/webhook secrets) avec fail-fast.
3. Durcir le handler d’erreur en prod (message client générique pour 5xx non `AppError`).
4. Ajouter tests E2E de non-régression pour:
   - guest checkout complet (intent -> order -> webhook),
   - signatures webhook invalides,
   - replays idempotency concurrents.
5. Réduire bruit logs 4xx attendues (notamment DB business errors) via niveau `warn` contrôlé et sampling.

---

## Conclusion

EPIC-1 est **proche** de la cible mais **pas prêt EPIC-2** tant que les 3 blockers (runtime order, test suite non green, sécurité webhook) ne sont pas levés.