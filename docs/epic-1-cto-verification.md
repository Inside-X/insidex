# Vérification CTO/SecEng EPIC-1 (préparation EPIC-2)

## Portée
Audit runtime + sécurité + validation + tests sur le dépôt courant.

## Résultat synthétique
- **Routes métier montées**: confirmé.
- **Rate limiting global + strict auth**: confirmé (avec 429).
- **Validation Zod stricte**: majoritairement confirmée.
- **Sécurité runtime (headers/CORS/error handler)**: globalement confirmée, avec points de vigilance.
- **Base de données (Prisma)**: cohérente, contraintes présentes.
- **Tests runtime**: présents, mais couverture incomplète sur certains endpoints auth sensibles.

## Points critiques
1. Endpoints `POST /api/auth/forgot`, `POST /api/auth/reset`, `POST /api/auth/refresh` sans tests runtime dédiés de montage + 429.
2. `POST /api/orders` n'applique pas `authorizeRole` (auth uniquement) : acceptable fonctionnellement selon produit, mais à verrouiller avant paiements réels si des rôles techniques sont introduits.

## Notes sécurité
- CORS prod protège explicitement contre wildcard `*`.
- Pas de stack trace en production dans la réponse JSON d'erreur.
- Logging prod ramené à `info` par défaut, mais le log de toutes les requêtes 2xx/3xx peut devenir volumineux en charge.