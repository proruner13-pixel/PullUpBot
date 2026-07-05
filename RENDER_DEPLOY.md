# PULLUP Backend on Render

The FastAPI application is `app.main:app`. Render must build from the
repository root because the Python package is located in `/app`, while the
canonical dependency list is in `/backend/requirements.txt`.

## Blueprint deployment

1. Push the complete `C:/PullUpBot` project to one GitHub, GitLab, or
   Bitbucket repository. The repository root must contain `render.yaml`,
   `requirements.txt`, `app/`, `backend/`, and `bot/`.
2. In Render, choose **New > Blueprint** and select that repository.
3. Before applying the Blueprint, enter the secret values requested for
   `DATABASE_URL`, `BOT_TOKEN`, and `ADMIN_ID`.
4. Confirm that `WEBAPP_URL` and `CORS_ORIGINS` point to the production
   Mini App origin: `https://pullupbot.vercel.app`.

The Blueprint configures:

```text
Runtime: Python 3
Root Directory: repository root (blank in Dashboard)
Build Command: pip install -r requirements.txt
Start Command: uvicorn app.main:app --host 0.0.0.0 --port $PORT
Health Check Path: /health
Python: 3.13.5
```

Do not add `PORT`; Render provides it.

## Manual Web Service deployment

If the Blueprint is not used, choose **New > Web Service**, select the same
repository, and copy the settings above. Add these environment variables:

```text
APP_ENV=production
DATABASE_URL=<Render internal PostgreSQL URL or another public PostgreSQL URL>
BOT_TOKEN=<Telegram bot token>
WEBAPP_URL=https://pullupbot.vercel.app
CORS_ORIGINS=https://pullupbot.vercel.app
ADMIN_ID=<numeric Telegram administrator ID>
TELEGRAM_AUTH_MAX_AGE=86400
PYTHON_VERSION=3.13.5
```

Never use `localhost` in production variables. Keep secrets in the Render
Dashboard, not in Git.

## PostgreSQL

When using Render Postgres, use its **Internal Database URL** when the database
and backend are in the same Render account and region. A new database must
have the PULLUP migration chain applied before Telegram authentication can
create users:

```powershell
$env:DATABASE_URL="<external database URL>"
python -m app.migrate status
python -m app.migrate up
python -m app.migrate verify
```

Run migrations deliberately against the intended database. They are not
executed automatically by `render.yaml`.

## Verification

After deployment, replace `<backend>` with the Render service URL:

```text
https://<backend>.onrender.com/health
https://<backend>.onrender.com/api/health/full
https://<backend>.onrender.com/docs
```

Expected liveness response:

```json
{"status":"ok","database":"not_checked"}
```

The full health endpoint returns HTTP 200 with `database: "up"` or HTTP 503
when PostgreSQL is unavailable.

Finally set this Production environment variable in the Vercel Mini App:

```text
VITE_API_URL=https://<backend>.onrender.com
```

Do not append `/docs`, `/health`, `/api`, or a trailing slash. Redeploy the
Mini App after changing a Vite environment variable.
