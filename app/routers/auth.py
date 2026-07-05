from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import get_settings, validate_init_data
from app.config import Settings
from app.database import Database
from app.dependencies import get_database
from app.repositories.users import upsert_user
from app.schemas import ProfileResponse, TelegramAuthRequest


router = APIRouter(tags=["auth"])


@router.post("/auth/telegram", response_model=ProfileResponse)
async def telegram_login(
    payload: TelegramAuthRequest,
    settings: Settings = Depends(get_settings),
    database: Database = Depends(get_database),
) -> ProfileResponse:
    try:
        telegram_user = validate_init_data(
            payload.initData,
            settings.bot_token,
            settings.telegram_auth_max_age,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc

    async with database.connection() as connection:
        profile = await upsert_user(connection, telegram_user)

    return ProfileResponse(**dict(profile))
