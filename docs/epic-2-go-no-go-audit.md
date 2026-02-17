# Audit complet Go/No-Go vers Epic 2 (commit actuel)

## Portée & méthode

Audit réalisé sur : backend Express (`src/`), frontend JS (`js/`), Prisma (`prisma/`), scripts (`scripts/`), tests (`tests/`), configuration Jest et dépendances npm.

### Contrôles exécutés

- `npm run test:coverage`
- `for f in $(rg --files src js scripts prisma tests --glob '*.js'); do node --check "$f" >/dev/null; done`
- `npm audit --json` *(bloqué par politique registry 403)*
- `npm outdated --json` *(bloqué par politique registry 403)*
- `rg -n "(API_KEY|SECRET|TOKEN|PASSWORD|PRIVATE KEY|sk_live|pk_live|BEGIN RSA|BEGIN PRIVATE|jwt|stripe|paypal)" src js prisma scripts tests .env* --glob '!node_modules/**'`

---

## 1) Analyse code source (syntaxe, anti-patterns, logique, validations)

## ✅ Validé

- **Syntaxe JS valide** sur les fichiers source/tests/scripts scannés via `node --check`.
- **Validation d’entrées stricte (Zod .strict())** sur payloads sensibles (auth, checkout, products, leads, webhooks).
- **RBAC/permissions présentes** avec séparation `authorizeRole` / `requirePermission`.
- **Protection signature webhooks** Stripe + vérification distante PayPal implémentées.
- **Headers de sécurité** activés globalement (CSP, X-Frame-Options, etc.).

## ⚠️ Anomalies / risques détectés

### [CRITIQUE] Endpoint webhook interne potentiellement non authentifié si secret absent
- `/api/orders/webhooks/payments` ne vérifie le header secret **que si** `PAYMENT_WEBHOOK_SECRET` est défini; sinon la route reste exploitable sans secret applicatif.
- Risque : marquage de commandes `paid` via appel API interne si d’autres contrôles applicatifs sont contournés.
- Fichier: `src/routes/orders.routes.js`.

### [CRITIQUE] Couverture de test affichée ≠ couverture réelle applicative
- `collectCoverageFrom` ne couvre que `src/validation/**`, `validation-error`, `error-handler`.
- Les modules critiques (authentification, routes paiement, repositories, middlewares de sécurité) ne sont **pas** dans la base de couverture instrumentée.
- Risque : faux sentiment de sécurité (98% global sur sous-périmètre).
- Fichier: `jest.config.js`.

### [CRITIQUE] Tokens stockés en `localStorage` côté frontend
- Access token + refresh token persistés en localStorage.
- Risque XSS -> exfiltration de session (compromission compte).
- Fichier: `js/modules/auth.js`.

### [MAJEUR] Limiteur de débit en mémoire locale (Map) sans éviction
- `createRateLimiter` conserve un `Map` en mémoire process, sans purge TTL globale.
- Risques:
  - croissance mémoire (nombre élevé d’IP)
  - inefficacité en multi-instance (pas de partage distribué)
  - contournement via rotation d’IP / cluster
- Fichier: `src/middlewares/rateLimit.js`.

### [MAJEUR] Vérification Stripe custom sans fenêtre de tolérance temporelle
- Vérifie HMAC mais n’impose pas de drift max sur timestamp `t=`.
- Risque de relecture (replay) au-delà de la fenêtre attendue si event idempotency était absent sur un flux.
- Fichier: `src/lib/stripe.js`.

### [MAJEUR] Logique auth encore “stub” pour production
- `/auth/login` retourne un token statique sans vérification mot de passe en base.
- `/auth/register` n’écrit pas en DB.
- `/auth/refresh` retourne `{ refreshed: true }` sans émettre de nouveau token.
- Risque : blocant fonctionnel/sécurité pour un Go production Epic 2 si ces routes sont censées être réelles.
- Fichier: `src/routes/auth.routes.js`.

### [MAJEUR] Calcul montant via Number/float
- Montants calculés via `Number(price)` puis `Math.round(total * 100)`.
- Risque d’arrondi flottant sur cas limites prix décimaux.
- Fichiers: `src/routes/payments.routes.js`, `src/repositories/order.repository.js`.

### [MODÉRÉ] Validation webhook permissive sur payload secondaire
- `payload: z.record(z.any())` pour webhooks/payments internes.
- Risque de charge inutile/objets volumineux, même si non exécutés.
- Fichier: `src/validation/schemas/orders.schema.js`.

### [MODÉRÉ] `express.json()` sans limite explicite
- Pas de `limit` configuré (ex. `1mb`) sur parser JSON.
- Risque DoS mémoire via gros corps HTTP (hors route Stripe raw).
- Fichier: `src/app.js`.

---

## 2) Analyse couverture tests

## Couverture mesurée (outillage actuel)

Résultat `npm run test:coverage`:

- **Global (périmètre instrumenté)**: Statements **98.91%**, Branches **91.42%**, Functions **100%**, Lines **98.87%**.
- **errors/validation-error.js**: 88.88 / 66.66 / 100 / 87.5.
- **middlewares/error-handler.js**: 100 / 94.44 / 100 / 100.
- **validation/**: 100 / 95.65 / 100 / 100.
- **validation/schemas/common.schema.js**: 0 / 0 / 0 / 0.
- **validation/schemas/index.js**: 0 / 0 / 0 / 0.

## Zones critiques non couvertes par instrumentation

- `src/routes/*.js` (auth, payments, webhooks, orders)
- `src/repositories/*.js` (order/cart/user/...)
- `src/middlewares` hors `error-handler`
- `src/security/*.js` (token verify / jwt config / RBAC)
- `src/lib/paypal.js`, `src/lib/stripe.js`

## Cas d’erreur / limites : état

- Des tests runtime/intégration existent (webhooks, checkout, auth) et passent.
- Mais la **preuve quantitative par fichier critique** reste insuffisante tant que `collectCoverageFrom` n’instrumente pas ces zones.

---

## 3) Dépendances & sécurité

## ✅ Validé

- Aucun secret live détecté dans le code source scanné (hors placeholders `.env/.env.example`).
- Validation Zod stricte et erreurs API uniformisées.
- Signature Stripe et vérification PayPal présentes.

## ⚠️ Limites d’audit dépendances

- `npm audit` et `npm outdated` **inexploitables** ici (403 registry/policy), donc vulnérabilités CVE et obsolescence non vérifiables dans cet environnement.

## Points sécurité à corriger

- Secret obligatoire pour webhook interne orders (voir critique).
- Migration tokens vers cookies `HttpOnly + Secure + SameSite` recommandée.
- Limite de payload JSON explicite.
- Durcir politique CSP selon besoins front réels (éviter `unsafe-inline` si possible).

---

## 4) Performance, limites, robustesse charge

## Risques principaux

1. **Rate limit en mémoire non distribué** -> non fiable en scale horizontal.
2. **Boucles de stock item-par-item** en transaction (N updates) -> contention DB possible sur gros paniers.
3. **Absence de limite body JSON** -> exposition aux payloads larges.
4. **Vérifications webhook externes PayPal** sans circuit breaker/timeout explicite applicatif.

## Recommandations perf

- Passer rate limit sur Redis (clé IP + route + fenêtre glissante).
- Poser limites `express.json({ limit })` + timeouts proxy/ingress.
- Ajouter métriques p95/p99 sur checkout/payment/webhook.
- Tester charge sur `create-intent` / `orders` / `webhooks` avec contention stock.

---

## 5) Décision Go/No-Go Epic 2

## Verdict proposé

- **NO-GO conditionnel (bloquant)** tant que les éléments critiques ci-dessous ne sont pas traités.

## Checklist priorisée

### Bloquants Go/No-Go (P0)

- [ ] Rendre `PAYMENT_WEBHOOK_SECRET` obligatoire + fail-fast boot config.
- [ ] Élargir `collectCoverageFrom` à tout `src/**` (ou au minimum auth/payments/webhooks/repositories/security).
- [ ] Remplacer stockage tokens `localStorage` par cookies HttpOnly/Secure.
- [ ] Éliminer les stubs auth (login/register/refresh) ou isoler clairement hors prod.

### Critiques à court terme (P1)

- [ ] Ajouter fenêtre temporelle Stripe (ex: 5 min) en plus du HMAC.
- [ ] Ajouter limite taille payload JSON et protections anti-abus.
- [ ] Fiabiliser money math (minor units entières côté DB/logic).
- [ ] Passer rate limiting en backend partagé (Redis) + nettoyage/TTL.

### Améliorations recommandées (P2)

- [ ] Couvrir `common.schema.js` / `index.js` ou sortir du périmètre coverage.
- [ ] Ajouter tests de non-régression pour cas extrêmes montants/stock/concurrence.
- [ ] Ajouter alerting sur erreurs webhook + retries contrôlés.

---

## Plan de correction recommandé avant Epic 2

1. **Sécurité immédiate (P0)**: webhook secret obligatoire, tokens cookies, auth non-stub.
2. **Fiabilité tests**: coverage scope complet + seuils sur modules critiques.
3. **Résilience charge**: rate-limit distribué, limites body, money in minor units.
4. **Validation finale**: rejouer tests unitaires/intégration + charge ciblée + audit dépendances hors environnement restreint.