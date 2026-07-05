from fastapi import APIRouter, Depends

from app.auth import TelegramUser, get_current_user
from app.database import Database
from app.dependencies import get_database
from app.repositories.users import upsert_user
from app.schemas import UserResponse


router = APIRouter(tags=["users"])


@router.get("/me", response_model=UserResponse)
async def get_me(
    telegram_user: TelegramUser = Depends(get_current_user),
    database: Database = Depends(get_database),
) -> UserResponse:
    async with database.connection() as connection:
        user = await upsert_user(connection, telegram_user)
    return UserResponse(
        **dict(user),
        photo_url=telegram_user.photo_url,
    )
