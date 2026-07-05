# PULLUP production deployment

## Architecture

- Telegram Mini App frontend: Vercel
- Public website: Vercel
- FastAPI backend: Railway
- Telegram bot: Railway
- PostgreSQL: Railway PostgreSQL or Neon

The backend and bot must use the same PostgreSQL database. The backend and bot
must also use the same `BOT_TOKEN`, because FastAPI validates Telegram
`initData` with that token.

## Before deployment

1. Store the project in a private Git repository.
2. Do not commit `.env`, `bot/.env`, database passwords, or bot tokens.
3. If a token has appeared in Git or a public message, revoke it through
   BotFather and create a new one.
4. Keep the Mini App and public website as their existing separate Vercel
   projects.

## ENV and verifying the correct database

### Local source of truth

The only local environment file for FastAPI, the Telegram bot, and migrations
is:

```text
C:/PullUpBot/.env
```

All three use the loader in `app/config.py`. It resolves the project root from
the Python file location, so behavior does not depend on the current working
directory. Existing Railway/system variables have priority over `.env`.

Do not create `app/.env`, `backend/.env`, or `bot/.env`. The files
`backend/.env.example` and `bot/.env.example` only document Railway variables;
they are not loaded locally.

The frontend never receives `DATABASE_URL`. Mini App uses only the public
`VITE_API_URL`; the website uses only public `REACT_APP_*` links.

### ENV doctor

From the repository root:

```bash
python tools/env_doctor.py
```

The command lists env files and variable names, reports the effective
backend/bot/migration database, detects conflicting database targets and
localhost production URLs, and masks passwords and tokens.

To perform read-only database checks:

```bash
python tools/env_doctor.py --check-db
```

This executes only PostgreSQL `SELECT` statements. It prints the selected
database name, database user, server address and port, and the `users` count.
It does not run migrations or modify data.

In pgAdmin, run:

```text
sql/check_current_database.sql
```

Compare `database_name`, `db_user`, server address/port, table list, and
migration versions with the env-doctor output. If they differ:

1. Stop before running migrations.
2. Check the pgAdmin server host, port, maintenance database, and user.
3. Check the masked `DATABASE_URL` host and database from env doctor.
4. Correct the root `.env` locally or Railway reference variable.
5. Run both read-only checks again.

`localhost` means the current machine/container. It is valid for local
development, but in Vercel it points to Vercel itself, and in Railway it points
to that individual service container. Production services must use public API
URLs or Railway/Neon PostgreSQL connection URLs.

### Environment ownership

Railway Backend:

```env
APP_ENV=production
DATABASE_URL=${{pullup-postgres.DATABASE_URL}}
BOT_TOKEN=telegram-bot-token
ADMIN_ID=telegram-admin-id
WEBAPP_URL=https://pullupbot.vercel.app
CORS_ORIGINS=https://pullupbot.vercel.app
```

Railway Bot:

```env
APP_ENV=production
DATABASE_URL=${{pullup-postgres.DATABASE_URL}}
BOT_TOKEN=telegram-bot-token
ADMIN_ID=telegram-admin-id
WEBAPP_URL=https://pullupbot.vercel.app
API_URL=https://pullup-backend.up.railway.app
```

Vercel Mini App:

```env
VITE_API_URL=https://pullup-backend.up.railway.app
```

## Railway project

Create one Railway project with three services:

1. `pullup-postgres`
2. `pullup-backend`
3. `pullup-bot`

Both application services use the repository root `/`. This is a shared
monorepo: the backend imports `app.*`, and the bot starts as `bot.main`.
Configure separate build and start commands in each Railway service.

## PostgreSQL

### Railway PostgreSQL

In the Railway project, select **New → Database → PostgreSQL**. Railway exposes
`DATABASE_URL`, `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, and `PGDATABASE`.

Add a reference variable to both application services:

```env
DATABASE_URL=${{pullup-postgres.DATABASE_URL}}
```

The exact service reference name must match the PostgreSQL service name shown
in Railway.

### Neon

Create a PostgreSQL database in Neon and copy its complete connection string
into `DATABASE_URL` for both Railway services. Keep SSL parameters supplied by
Neon in the URL.

### Migrations

Numbered files in `migrations/` are the source of truth. On a fresh database,
the migration runner applies:

1. `001_create_challenges.up.sql`
2. `002_shared_product_schema.up.sql`
3. `003_production_submissions_flow.up.sql`

Before the first production migration, make a database backup. From the
repository root, with `DATABASE_URL` configured:

```bash
python -m app.migrate status
python -m app.migrate up
python -m app.migrate verify
```

For the backend Railway service, the future pre-deploy command can be:

```text
python -m app.migrate up
```

Do not configure that pre-deploy command until the migration has first been
reviewed and explicitly approved for the production database.

To inspect the resulting schema in pgAdmin, Railway Query, or Neon SQL Editor,
run `sql/verify_schema.sql`.

Never run `app.migrate down` against production. Migration `002` intentionally
has no destructive down migration.

## FastAPI backend service

Railway settings:

```text
Root Directory: /
Build Command: pip install -r backend/requirements.txt
Start Command: uvicorn app.main:app --host 0.0.0.0 --port $PORT
Healthcheck Path: /health
```

Environment variables:

```env
APP_NAME=PULLUP API
APP_ENV=production
DATABASE_URL=${{pullup-postgres.DATABASE_URL}}
BOT_TOKEN=telegram-bot-token
ADMIN_ID=telegram-admin-id
CORS_ORIGINS=https://pullupbot.vercel.app
WEBAPP_URL=https://pullupbot.vercel.app
TELEGRAM_AUTH_MAX_AGE=86400
```

`ADMIN_ID` and `WEBAPP_URL` are shared deployment settings reserved for later
moderation integration. Current Telegram authentication requires `BOT_TOKEN`.

Generate a public Railway domain in **Backend → Settings → Networking**. If the
generated URL is `https://pullup-backend.up.railway.app`, verify:

```text
https://pullup-backend.up.railway.app/health
https://pullup-backend.up.railway.app/api/health/full
https://pullup-backend.up.railway.app/docs
```

`/health` is a liveness endpoint. `/api/health/full` checks PostgreSQL and
returns HTTP 503 when the database is unavailable.

## Telegram bot service

Railway settings:

```text
Root Directory: /
Build Command: pip install -r bot/requirements.txt
Start Command: python -m bot.main
Replicas: 1
```

Environment variables:

```env
APP_ENV=production
BOT_TOKEN=telegram-bot-token
ADMIN_ID=telegram-admin-id
DATABASE_URL=${{pullup-postgres.DATABASE_URL}}
WEBAPP_URL=https://pullupbot.vercel.app
API_URL=https://pullup-backend.up.railway.app
BOT_PUBLIC_URL=https://t.me/ActiveRunBot
SUPPORT_URL=https://t.me/ActiveRunBot
WEBAPP_DEEP_LINKS_ENABLED=false
```

`API_URL` is prepared for the later moderation integration and is not used by
the current bot flow.

The bot uses long polling. Run exactly one polling instance for one
`BOT_TOKEN`; multiple replicas will conflict while receiving Telegram updates.
The bot service does not need a public Railway domain.

The expected Web App button is:

```python
InlineKeyboardButton(
    text="Открыть PULLUP",
    web_app=WebAppInfo(url=WEBAPP_URL),
)
```

## Vercel Mini App

After the backend domain works, open the existing `pullupbot` Vercel project
and add this Production environment variable:

```env
VITE_API_URL=https://pullup-backend.up.railway.app
```

Do not use `localhost`, and do not add a trailing slash. Rebuild and deploy the
Mini App from its repository root:

```bash
vercel --prod
```

The `VITE_` value is embedded at build time, so changing it without redeploying
does not update the deployed frontend.

## Telegram configuration

1. Set `WEBAPP_URL=https://pullupbot.vercel.app` in the bot service.
2. Ensure BotFather allows the Vercel Mini App domain.
3. Restart the Railway bot service after changing its variables.
4. Open the application only through the `Открыть PULLUP` Web App button when
   testing real Telegram authentication.

## Production checks

1. Open backend `/health`; expect HTTP 200.
2. Open `/api/health/full`; expect `database: up`.
3. Open backend `/docs`; ensure `/auth/telegram` is listed.
4. Run `sql/verify_schema.sql` and confirm `users`, `pullups`, `challenges`,
   `user_challenges`, `submissions`, and `token_transactions`.
5. Check the `schema_migrations` table for versions `001`, `002`, and `003`.
6. Send `/start` to `@ActiveRunBot`.
7. Press `Открыть PULLUP` and confirm the Web App opens.
8. In Mini App AUTH DEBUG, confirm:
   - `mode: telegram`
   - `profileSource: backend`
   - the real `telegram_id`
   - successful auth status
   - the Railway backend URL
9. Confirm the real Telegram user appears in PostgreSQL `users`.

This deployment stage does not enable frontend video upload, moderation API,
token awards, leaderboard API, achievements, or rating synchronization.
