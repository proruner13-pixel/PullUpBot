from fastapi import APIRouter, Depends, Response, status

from app.database import Database
from app.dependencies import get_database
from app.repositories.challenges import list_active_catalog
from app.schemas import HealthResponse


router = APIRouter(tags=["system"])
public_router = APIRouter(tags=["system"])


@public_router.get("/health", response_model=HealthResponse)
async def liveness() -> HealthResponse:
    return HealthResponse(status="ok", database="not_checked")


@router.get("/health", response_model=HealthResponse)
@router.get("/health/full", response_model=HealthResponse)
async def readiness(
    response: Response,
    database: Database = Depends(get_database),
) -> HealthResponse:
    database_ok = await database.is_healthy()
    active_challenge_slugs: list[str] = []
    if database_ok:
        async with database.connection() as connection:
            active_challenge_slugs = [
                row["slug"]
                for row in await list_active_catalog(connection)
            ]
    if not database_ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return HealthResponse(
        status="ok" if database_ok else "degraded",
        database="up" if database_ok else "down",
        database_connected=database_ok,
        active_challenges_count=len(active_challenge_slugs),
        active_challenge_slugs=active_challenge_slugs,
    )
