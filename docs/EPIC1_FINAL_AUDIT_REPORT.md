# Audit Final EPIC 1 — Gate vers EPIC 2

Date: 2026-02-18  
Auditeur: GPT-5.2-Codex (audit zéro tolérance)

## 1) Score global EPIC 1

**Score global: 41%**  
**Verdict global: NO-GO**

Règle appliquée: toute ambiguïté est classée risque, toute implémentation incomplète ou permissive est classée NON CONFORME.

---

## 2) Tableau conformité par section

| Section | Score | Statut | Motif principal |
|---|---:|---|---|
| 1. Transaction Integrity | 62% | PARTIEL | Transaction Prisma présente mais incohérences d’état et anti-double paiement incomplètes. |
| 2. Payment Layer | 64% | PARTIEL | Stripe solide côté signature, PayPal incomplet (secret fail-fast incomplet, verify endpoint permissif). |
| 3. Auth & RBAC | 34% | NON CONFORME | Flux refresh/login incohérent, route logout dupliquée, stockage session refresh mémoire volatile. |
| 4. Redis & Rate Limiting | 46% | PARTIEL | Atomicité Lua présente mais intégration Redis inactive en runtime et configuration proxy ambiguë. |
| 5. Webhook Integrity | 58% | PARTIEL | Signature avant parse OK Stripe, idempotency TTL OK mais ordering/state machine incomplète et limites payload inégales. |
| 6. Coverage & CI/CD | 15% | NON CONFORME | Seuils réels très inférieurs aux objectifs, pas de pipeline CI stricte observée. |
| 7. Chaos Test Readiness | 28% | NON CONFORME | Résilience partielle, scénarios chaos incomplets et non verrouillés par des gates. |
| 8. Observabilité | 55% | PARTIEL | Logs structurés présents, correlationId partiel, risque de bruit console élevé, monitoring non branché. |

---

## 3) Liste exhaustive des déviations

### Section 1 — Transaction Integrity

1. **Montant recalculé serveur en `float` puis comparaison epsilon**: conversion via `Number(...)` et comparaison flottante (`0.000001`) au lieu d’un invariant strict en minor units. Risque de dérive monétaire.  
2. **Idempotency de création commande dépendante d’un unique key DB mais retour potentiellement incomplet** selon `findUnique` sans include dans un des chemins legacy.  
3. **Machine d’état commande minimale (`pending` → `paid`) sans état intermédiaire explicite** (authorized/captured/failed), ce qui fragilise l’ordering événementiel.  
4. **Concurrence stock traitée par `updateMany stock >= qty` (correct), mais absence de verrouillage explicite sur ordre multi-événements inter-providers**.

### Section 2 — Payment Layer

5. **PayPal verification fail-fast incomplet au boot**: `PAYPAL_WEBHOOK_ID` et `PAYPAL_CLIENT_ID` non exigés par validation de boot alors qu’ils sont requis au runtime.  
6. **Réponse de vérification PayPal permissive côté erreurs endpoint** (`VERIFICATION_ENDPOINT_ERROR`) transformée en simple `validated=false` sans circuit breaker/alerting dur.  
7. **Absence de contrôle strict d’ordering multi-event type côté Stripe/PayPal** (only one happy path type).  
8. **Risque montant flottant côté PayPal**: `parseFloat` puis `Math.round` sur montant textuel externe.

### Section 3 — Auth & RBAC

9. **Route `POST /logout` définie deux fois**: la seconde route court-circuite la révocation de session refresh. Déviation critique sécurité session.  
10. **Régression visible dans tests runtime auth (`refresh` attendu 200, reçu 401)**: comportement runtime incompatible avec exigences.  
11. **Store refresh token en mémoire process (`Map`)**: perte à restart, non partagé multi-instance, invalide pour SaaS distribué.  
12. **Role issu du JWT sans revalidation serveur sur source d’autorité** (pas de lookup user/permissions dynamiques).  
13. **`sameSite: 'lax'` uniformisé sans politique explicite selon contexte cross-site**: ambiguïté de sécurité/UX.

### Section 4 — Redis & Rate Limiting distribué

14. **Redis rate limiting activable mais client injecté `null` en config runtime** (`createRateLimitRedisStore({ redisClient: null ... })`) => fallback mémoire de facto.  
15. **Mode API limiter `onStoreFailure: 'allow'`**: ouverture de bypass en cas panne backend rate-limit.  
16. **Comportement proxy dépend de `trust proxy` applicatif sans garde d’initialisation centralisée**: ambiguïté spoofing selon déploiement.  
17. **Fallback mémoire local non distribué**: incohérent avec exigences multi-instance.

### Section 5 — Webhook Integrity

18. **Idempotency store par défaut en mémoire**: replay protection non distribuée si Redis absent.  
19. **Fenêtre temporelle Stripe OK (±300s), mais PayPal ne force pas de fenêtre locale explicite** (dépendant API distante uniquement).  
20. **Pas de corrélation forte persisted audit trail indépendante** (logs oui, mais sans pipeline de stockage audit immuable).  
21. **Gestion ordering partielle**: événements hors séquence retournent `ignored` mais sans file compensatoire ni dead-letter.

### Section 6 — Coverage & CI/CD

22. **Couverture globale observée largement sous seuil cible** (Objectif 95/90/100/95 non atteint).  
23. **Modules critiques sous seuil**: `order.repository`, `webhooks.routes`, `paypal`, `auth.routes`, `rate-limit-redis-store`.  
24. **Aucune pipeline CI (3 gates strictes) versionnée dans repo inspecté.**  
25. **Suite de tests courante en échec (4 suites, 7 tests).**

### Section 7 — Chaos

26. **Chaos readiness non verrouillée**: Stripe/PayPal/Prisma/Redis dégradés partiellement testés, mais pas de matrice exhaustive passante exigée.  
27. **Scénarios concurrence paiement inter-provider non démontrés en test de non-régression robuste.**

### Section 8 — Observabilité

28. **Logs structurés JSON concaténés à message texte console, sans standard OTEL ni exporters.**  
29. **`console.error`/`warn` massif en test/runtime sans classification centralisée severité-service.**  
30. **CorrelationId présent via middleware, mais pas injecté systématiquement dans toutes branches d’erreur applicatives.**

---

## 4) Classification gravité

### CRITIQUE
- D9 Route logout dupliquée (session invalidation contournable).
- D10 Régression auth refresh en intégration (401 inattendu).
- D11 Refresh store mémoire non distribué/non persistant.
- D15 Rate-limit fail-open (`allow`) sur panne backend.
- D22/D24/D25 Couverture/CI gates non conformes + tests en échec.

### MAJEUR
- D5, D6, D14, D18, D21, D23, D26, D27, D30.

### MINEUR
- D1, D2, D3, D4, D7, D8, D12, D13, D16, D17, D19, D20, D28, D29.

---

## 5) Plan de correction détaillé par déviation

Format: **[ID] fichier(s) impacté(s) — type correction — tests à ajouter — effort — risque si non corrigé**

- **[D9] `src/routes/auth.routes.js`** — supprimer route logout dupliquée, conserver version avec révocation refresh + clear cookie — tests: `logout revokes session`, `logout replay fails` — **0.5j** — session hijack prolongé.
- **[D10] `src/routes/auth.routes.js`, `src/security/refresh-token-store.js`** — aligner contrat refresh (status/body) avec tests runtime + rotation stricte — tests: runtime contract, reuse detection, flood boundary — **1j** — indisponibilité auth/contournements.
- **[D11] `src/security/refresh-token-store.js`** — migrer vers store persistant (Redis/Postgres), hash + TTL + index user/session — tests: multi-instance simulation, restart persistence — **2-3j** — invalidation non fiable.
- **[D15] `src/middlewares/rateLimit.js`** — passer auth+API en fail-closed configurable pour endpoints sensibles — tests: redis down for auth/api, expected 503/429 policies — **1j** — brute-force/bypass sous panne.
- **[D14/D17] `src/middlewares/rateLimit.js`, bootstrap infra** — injecter vrai client Redis + health check + circuit breaker — tests: reconnect, split-brain, concurrent burst 100+ — **2j** — protection distribuée illusoire.
- **[D5] `src/config/boot-validation.js`, `src/lib/paypal.js`** — exiger `PAYPAL_CLIENT_ID`, `PAYPAL_WEBHOOK_ID` au boot prod — tests: boot fail-fast matrix — **0.5j** — démarrage partiellement cassé en prod.
- **[D1/D8] `src/repositories/order.repository.js`, `src/routes/webhooks.routes.js`** — standardiser en minor units int64 partout (DB + calcul + compare stricte) — tests: rounding edgecases, currency mismatch — **1.5j** — erreurs monétaires.
- **[D3/D21] `src/repositories/order.repository.js`, `src/routes/webhooks.routes.js`** — implémenter state machine explicite (pending/authorized/captured/failed/refunded) + transition guards — tests: ordering permutations + invalid transitions — **2j** — incohérences comptables.
- **[D18] `src/lib/webhook-idempotency-store.js`** — idempotency store distribué obligatoire (pas de fallback mémoire en prod) — tests: replay cross-instance — **1j** — replay possible multi-node.
- **[D22/D23] `jest.config.js`, nouveaux tests ciblés** — relever coverage + seuils stricts globaux et par module critique — tests: enforce thresholds; remove uncovered dead paths — **2-4j** — régressions silencieuses.
- **[D24] `.github/workflows/*` (ou pipeline équivalent)** — créer 3 gates (lint+unit+integration+security audit) bloquants — tests: pipeline dry-run — **1-2j** — qualité non gouvernée.
- **[D26/D27] `tests/chaos/*.test.js`** — ajouter chaos suite déterministe: redis down, stripe timeout, paypal 500, prisma error, replay, refresh reuse, concurrent payments — **2-3j** — comportement prod imprévisible.
- **[D28/D30] `src/utils/logger.js`, middleware observabilité** — standardiser logs JSON purs + champ `correlationId` obligatoire + masquage PII/secret — tests: log schema tests — **1j** — forensic incident limité.

---

## 6) Risques résiduels acceptables ou non

- **Acceptables (temporairement)**: mineurs d’ergonomie logging sans impact direct sécurité/financier immédiat.
- **Non acceptables**: toute faille session refresh, replay multi-instance, fail-open rate-limit, absence CI gates strictes, couverture insuffisante des modules financiers.

**Conclusion risques résiduels**: non acceptables en l’état pour passage EPIC 2.

---

## 7) Recommandations architecture EPIC 2

1. Introduire une **Payment State Machine** centralisée et versionnée.  
2. Rendre **Redis obligatoire** pour anti-replay + refresh sessions + distributed rate-limit.  
3. Migrer observabilité vers **JSON logs + trace correlation + métriques RED/USE + alerting SLO**.  
4. Ajouter **Outbox pattern** pour événements paiement/webhooks et compensation transactionnelle.  
5. Verrouiller **CI policy-as-code**: seuils coverage, tests chaos critiques, audit dépendances, secret scanning.

---

## 8) Verdict final

# **NO-GO EPIC 2**

Justification technique:
- Contrôles sécurité session et contrôle de charge non suffisamment robustes en mode dégradé.
- Garanties d’intégrité financière incomplètes sur tous les chemins (ordering, minor units uniformes, multi-instance idempotency).
- Gouvernance qualité insuffisante (tests en échec, couverture et CI en deçà du standard demandé).

Le passage EPIC 2 est **refusé** tant que les déviations critiques/majeures ne sont pas corrigées et revalidées par une campagne de non-régression complète.