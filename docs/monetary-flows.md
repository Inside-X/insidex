# 🏦 Monetary Flows & Security Audit — Prompt 3

## 1️⃣ `/api/payments/create-intent`

**Source prix :** DB `Product.price`  
**Champs acceptés côté client :** `id`, `quantity` (pas de champ `price`)  

**Flux de validation et conversion :**  
- Schema gate strict → rejette floats, notations scientifiques et strings numériques  
- Conversion **exactement une fois** via `toMinorUnits`  
- Somme des lignes : `multiplyMinorUnits` + `sumMinorUnits`  

**Persistance / Destination :**  
- `Order.totalAmountMinor` en DB  
- Aucun float client ne peut passer → zéro risque de double conversion  

**Tests de sécurité :**  
- Injection float/scientific sur `items[].price` → rejeté  
- Malformed payload → rejeté avant persistance  

---

## 2️⃣ `/api/orders`

**Source prix :** DB `Product.price`  
**Champs acceptés côté client :** `id`, `quantity`  

**Flux de validation et conversion :**  
- Schema gate strict pour chaque item  
- Conversion unique en minor units (`toMinorUnits`) avant stockage  

**Persistance / Destination :**  
- `Order.totalAmountMinor` calculé exclusivement à partir de DB prices  

**Tests de sécurité :**  
- Float/scientific injections client → rejetées  
- Valeurs négatives ou nulles interdites → rejetées  

---

## 3️⃣ `/api/webhooks/paypal` et `/api/webhooks/stripe`

**Source prix :** Payload du provider (PayPal/Stripe)  

**Flux de validation et conversion :**  
- Parse JSON strict → clé monétaire en string décimale uniquement  
- Replay-claim check → empêche double traitement  
- Signature verification → valide l’origine  
- Conversion **exactement une fois** via `toMinorUnits`  

**Persistance / Destination :**  
- Update DB order → `Order.totalAmountMinor` ou capture amount minor  

**Tests de sécurité :**  
- Payload float ou scientific → rejeté avant signature check  
- Malformed numeric payload → rejeté  

---

## 4️⃣ Frontend checkout

**Source prix :** DB `Product.price`  
**Champs côté client :** `id`, `quantity`  

**Flux de validation et conversion :**  
- Prix client non autorisé → seulement `quantity` transmis  
- Conversion unique en minor units côté frontend (`toMinorUnitsDecimalString`)  
- Envoi vers `/api/payments/create-intent`  

**Tests de sécurité :**  
- Tentative d’injection float/scientific côté client → impossible  
- Tous les calculs d’agrégation utilisent minor units → zéro drift  

---

## 5️⃣ Principes globaux de sécurité monétaire

1. **Conversion unique** : chaque flux monétaire passe par `toMinorUnits` une seule fois  
2. **Rejet systématique des floats/scientific** : côté client et côté webhook provider  
3. **Centralisation** : toutes les opérations arithmétiques passent par `minor-units.js`  
4. **Idempotence et replay guard** : webhooks ne peuvent pas doubler les montants  
5. **Tests exhaustifs** : flux simulés avec payloads malformés et injections float/scientific  

---