from fastapi import APIRouter, Depends, Response, status

from app.database import Database
from app.dependencies import get_database
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
    if not database_ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return HealthResponse(
        status="ok" if database_ok else "degraded",
        database="up" if database_ok else "down",
    )
