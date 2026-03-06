# EPIC-5 Catalogue V1 Dev Quickstart

## Prerequisites
- PostgreSQL running locally and reachable from `DATABASE_URL`.
- Redis is optional in development (dev fallback behavior may be used when Redis is unavailable).

## Local setup (deterministic)
1. Export DB connection (example with `insidex_clean`):
   ```bash
   export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/insidex_clean?schema=public"
   ```
2. Apply migrations:
   ```bash
   npm run prisma:migrate
   ```
3. Generate Prisma client:
   ```bash
   npm run prisma:generate
   ```
4. Seed deterministic Catalogue V1 data:
   ```bash
   npm run prisma:seed
   ```
5. Start the local app in development mode:
   ```bash
   npm run start:dev
   ```
6. Run deterministic EPIC-5.1C API verification:
   ```bash
   npm run epic:5.1c:verify
   ```

## API curl smoke checks
- List:
  ```bash
  curl -sS "http://127.0.0.1:3000/api/products?page=1&pageSize=24"
  ```
- Detail (seeded slug example):
  ```bash
  curl -sS "http://127.0.0.1:3000/api/products/cafe-signature-v1"
  ```

## UI quickstart
- Home grid: <http://127.0.0.1:3000/>
- PDP seeded example: <http://127.0.0.1:3000/product.html?slug=cafe-signature-v1>

## Fail-closed notes
- Production fail-closed behavior is unchanged.
- Redis fallback behavior described above is development-only and does not relax production guarantees.