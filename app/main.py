from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import logging
from urllib.parse import urlsplit

from app.config import Settings
from app.database import Database
from app.repositories.challenges import list_active_catalog
from app.routers import (
    achievements,
    auth,
    challenges,
    health,
    leaderboard,
    profile,
    submissions,
    users,
)
from app.schema_validation import SchemaMismatchError, validate_required_schema

logger = logging.getLogger("pullup.api")


def _database_log_parts(database_dsn: str) -> tuple[str, str]:
    try:
        parsed = urlsplit(database_dsn)
    except ValueError:
        return "<invalid>", "<invalid>"
    return parsed.hostname or "<unknown>", parsed.path.lstrip("/") or "<unknown>"


def create_app(settings: Settings | None = None) -> FastAPI:
    app_settings = settings or Settings.from_env()
    database = Database(app_settings.database_dsn)
    uploads_dir = app_settings.upload_dir

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        uploads_dir.mkdir(parents=True, exist_ok=True)
        (uploads_dir / "submissions").mkdir(parents=True, exist_ok=True)
        logger.info("UPLOAD_DIR_CONFIG upload_dir=%s", uploads_dir)
        await database.connect()
        try:
            async with database.connection() as connection:
                await validate_required_schema(connection)
                active_challenges = await list_active_catalog(connection)
                database_host, database_name = _database_log_parts(
                    app_settings.database_dsn
                )
                active_slugs = [row["slug"] for row in active_challenges]
                logger.info(
                    "DATABASE_CONFIG host=%s database=%s",
                    database_host,
                    database_name,
                )
                logger.info(
                    "CHALLENGES_DB_CHECK count=%s slugs=[%s]",
                    len(active_slugs),
                    ",".join(active_slugs),
                )
            yield
        except SchemaMismatchError:
            logger.exception("DATABASE_SCHEMA_MISMATCH")
            raise
        finally:
            await database.close()

    application = FastAPI(
        title=app_settings.app_name,
        version="1.0.0",
        lifespan=lifespan,
    )
    application.state.settings = app_settings
    application.state.database = database
    uploads_dir.mkdir(parents=True, exist_ok=True)

    application.add_middleware(
        CORSMiddleware,
        allow_origins=list(app_settings.cors_origins),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    application.include_router(health.router, prefix="/api")
    application.include_router(health.public_router)
    application.include_router(users.router, prefix="/api")
    application.include_router(challenges.router, prefix="/api")
    application.include_router(achievements.router, prefix="/api")
    application.include_router(leaderboard.router, prefix="/api")
    application.include_router(auth.router)
    application.include_router(profile.router)
    application.include_router(submissions.router)
    application.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")
    return application


app = create_app()
