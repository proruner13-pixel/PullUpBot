# Database migrations

Migrations are applied in numeric order and recorded in
`public.schema_migrations`.

From the project root:

```powershell
.\venv\Scripts\python.exe -m app.migrate preflight
.\venv\Scripts\python.exe -m app.migrate status
.\venv\Scripts\python.exe -m app.migrate up
.\venv\Scripts\python.exe -m app.migrate verify
.\venv\Scripts\python.exe -m app.migrate down
```

Always back up the database and run `status` before `up` or `down`.
The `down` command removes data created by the reverted migration.

Migration `001` belongs to the legacy per-user challenges schema. If the
shared schema migration `002` is already recorded, the runner reports `001`
as `superseded` and never applies it.

Migration `003` adds validation for production submission types and prevents
more than one token transaction from being created for the same submission.

## Source of truth

Numbered `*.up.sql` files in this directory are the source of truth.
`sql/schema.sql` is a pgAdmin-friendly bootstrap snapshot equivalent to
migration `002`; always run `python -m app.migrate up` afterward so later
migrations such as `003` are applied.

Fresh databases run `001`, `002`, and `003` in order. Migration `001` creates
the minimal legacy `users`, `pullups`, and per-user challenge foundation.
Migration `002` preserves those rows, archives the legacy challenge table as
`legacy_user_challenges`, and creates the shared product schema.

Migration `002` intentionally has no down migration. Reverting it would require
dropping shared production tables and could destroy user data, so the migration
runner fails safely instead.
