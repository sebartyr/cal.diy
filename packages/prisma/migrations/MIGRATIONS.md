# Prisma migration conventions (Clever fork)

These conventions exist so a migration that lands on production never
locks an active table for more than a few milliseconds. They were
written as BUG-011 / SPRINT4-016.

## Index changes

**Use `CREATE INDEX CONCURRENTLY` and `DROP INDEX CONCURRENTLY`.** Both
avoid the `ACCESS EXCLUSIVE` lock that the plain forms take.

```sql
-- ✅ Concurrently — no write lock
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Booking_eventTypeId_startTime_status_idx"
  ON "Booking" ("eventTypeId", "startTime", "status");

DROP INDEX CONCURRENTLY IF EXISTS "OldIndex_idx";

-- ❌ Plain — locks the table, can stall the app under load
CREATE INDEX "Booking_x_idx" ON "Booking" ("x");
```

Prisma's auto-generated migrations emit the plain form. After running
`prisma migrate dev --create-only`, **edit the SQL by hand** to insert
`CONCURRENTLY` (and `IF NOT EXISTS`/`IF EXISTS`, since `CONCURRENTLY`
cannot run inside an implicit transaction — see below).

## Wrap rules

`CREATE INDEX CONCURRENTLY` cannot run inside a transaction block.
Prisma wraps each migration in `BEGIN...COMMIT` by default. To opt
out, put the statement in its own migration file and start that file
with:

```sql
-- Prisma: skip transaction (CREATE INDEX CONCURRENTLY)
-- @prisma:no-transaction
```

(Prisma honors the `-- @prisma:no-transaction` directive at file
scope.) Keep concurrent-index migrations isolated from any other DDL.

## Adding NOT NULL columns

Adding a `NOT NULL` column without a default forces a full-table
rewrite under `ACCESS EXCLUSIVE`. Split into three migrations:

1. Add the column as `NULL` with a default.
2. Backfill in batches (e.g. an admin job) or via `UPDATE` chunks.
3. Promote to `NOT NULL` once the column has no nulls left.

## Renaming columns / tables

Don't. Use a new column/table, dual-write from the app, switch reads,
then drop the old one in a later migration. Renames look cheap but
break every concurrent read of the old name during the transition.

## Foreign keys

Adding a foreign key in PostgreSQL takes a table-level lock and
verifies every existing row. For large tables:

1. `ADD CONSTRAINT ... NOT VALID;` (skips verification).
2. `VALIDATE CONSTRAINT ...;` in a follow-up migration (table-level
   `SHARE UPDATE EXCLUSIVE` only; doesn't block reads/writes).

## Local workflow

```bash
# Create the migration but don't apply yet
npx prisma migrate dev --create-only --name <descriptive_name>

# Edit the generated SQL: add CONCURRENTLY where applicable, add the
# no-transaction directive if needed, split into multiple files if the
# migration touches both DDL and DML.

# Apply locally and verify
yarn workspace @calcom/prisma db-migrate
```

## Review checklist

- [ ] Plain `CREATE INDEX` / `DROP INDEX` replaced by `CONCURRENTLY`.
- [ ] Concurrent-DDL migrations are in their own file with the no-tx
      directive.
- [ ] No rename of an existing column/table.
- [ ] New `NOT NULL` columns split into add → backfill → promote.
- [ ] New FKs use `NOT VALID` + `VALIDATE` for large tables.
- [ ] Migration tested against a snapshot of staging volume when
      touching any of the hot tables (`Booking`, `User`, `Webhook`,
      `Membership`).
