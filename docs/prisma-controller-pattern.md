# Pattern recommandé pour controllers (Prisma repositories)

## Objectif

Garder les responsabilités claires:
- **Controller**: HTTP only (req/res, status code, validation output).
- **Service (optionnel)**: logique métier/orchestration.
- **Repository**: accès DB uniquement (Prisma), sans logique métier.

## Exemple controller (User)

```js
import userRepository from '../repositories/user.repository.js';

export async function createUserController(req, res, next) {
  try {
    const user = await userRepository.create({
      email: req.body.email,
      passwordHash: req.body.passwordHash,
      role: req.body.role ?? 'customer',
    });

    return res.status(201).json({ data: user });
  } catch (error) {
    return next(error);
  }
}
```

## Bonnes pratiques

1. Toujours valider les inputs en amont (Zod middleware existant).
2. Ne jamais exposer `passwordHash` dans les réponses API.
3. Mapper les erreurs DB normalisées (`DB_UNIQUE_CONSTRAINT`, etc.) dans un error handler global.
4. Utiliser les méthodes transactionnelles du repository pour les écritures multi-tables (checkout/order).