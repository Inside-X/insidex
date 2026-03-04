# Backup / Restore Drill (PostgreSQL)

Operational drill only. No production credentials in docs.

## Backup strategy (logical dump)
- Suggested command shape (placeholder values only):
  - `pg_dump --format=custom --compress=9 --no-owner --no-privileges --file=<backup_file.dump> <database_url_or_name>`
- Store backups in approved encrypted storage location with retention policy.
- Do not store credentials in scripts or repository.

## Restore drill (non-production only)
1. Provision an empty non-prod database.
2. Restore dump:
   - `pg_restore --clean --if-exists --no-owner --no-privileges --dbname=<target_db> <backup_file.dump>`
3. Schema alignment check:
   - Run `npx prisma migrate deploy` if pending migrations are expected for drill target.
   - If no migration expected, verify schema alignment against current release SHA.
4. Boot service against restored DB.
5. Run minimal integrity checks (non-sensitive):
   - Basic row count checks for core tables (orders/products/users as applicable)
   - Verify latest order records are queryable
   - Run lightweight app sanity checks (health + key read endpoints)

## Acceptance criteria
- Restore completed successfully.
- Service boots successfully against restored DB.
- Sanity checks pass.

## Frequency and ownership
- Recommended cadence: monthly (minimum), weekly for high-change environments.
- Owner: on-call platform/SRE + DB owner (joint sign-off).

## Safety
- Never include production secrets, tokens, keys, or real customer payloads in drill artifacts.