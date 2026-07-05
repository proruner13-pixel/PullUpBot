from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import TelegramUser, get_current_user
from app.database import Database
from app.dependencies import get_database
from app.repositories.users import get_profile, update_avatar, upsert_user
from app.schemas import AvatarUpdateRequest, ProfileResponse


router = APIRouter(tags=["profile"])


@router.get("/profile/me", response_model=ProfileResponse)
async def profile_me(
    telegram_user: TelegramUser = Depends(get_current_user),
    database: Database = Depends(get_database),
) -> ProfileResponse:
    async with database.connection() as connection:
        await upsert_user(connection, telegram_user)
        profile = await get_profile(connection, telegram_user.id)

    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found",
        )
    return ProfileResponse(**dict(profile))


@router.patch("/profile/me/avatar", response_model=ProfileResponse)
async def profile_avatar(
    payload: AvatarUpdateRequest,
    telegram_user: TelegramUser = Depends(get_current_user),
    database: Database = Depends(get_database),
) -> ProfileResponse:
    async with database.connection() as connection:
        await upsert_user(connection, telegram_user)
        profile = await update_avatar(
            connection,
            telegram_user.id,
            payload.avatar_url,
        )
    return ProfileResponse(**dict(profile))
