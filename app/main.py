from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import PROJECT_ROOT, Settings
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
    uploads_dir = PROJECT_ROOT / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)

    application.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "https://pullupbot.vercel.app",
            "https://pullup-backend-dtxl.onrender.com",
            "http://localhost:5173",
            "http://localhost:3000",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    application.include_router(health.router, prefix="/api")
    application.include_router(health.public_router)
    application.include_router(users.router, prefix="/api")
    application.include_router(challenges.router, prefix="/api")
    application.include_router(achievements.router, prefix="/api")
    application.include_router(auth.router)
    application.include_router(profile.router)
    application.include_router(submissions.router)
    application.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")
    return application


app = create_app()
