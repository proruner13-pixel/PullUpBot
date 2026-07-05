from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings
from app.database import Database
from app.routers import (
    achievements,
    auth,
    challenges,
    health,
    profile,
    submissions,
    users,
)


def create_app(settings: Settings | None = None) -> FastAPI:
    app_settings = settings or Settings.from_env()
    database = Database(app_settings.database_dsn)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        await database.connect()
        try:
            yield
        finally:
            await database.close()

    application = FastAPI(
        title=app_settings.app_name,
        version="1.0.0",
        lifespan=lifespan,
    )
    application.state.settings = app_settings
    application.state.database = database

    application.add_middleware(
        CORSMiddleware,
        allow_origins=list(app_settings.cors_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    application.include_router(health.router, prefix="/api")
    application.include_router(health.public_router)
    application.include_router(users.router, prefix="/api")
    application.include_router(challenges.router, prefix="/api")
    application.include_router(achievements.router, prefix="/api")
    application.include_router(auth.router)
    application.include_router(profile.router)
    application.include_router(submissions.router)
    return application


app = create_app()
