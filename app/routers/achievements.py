from fastapi import APIRouter, Depends

from app.auth import TelegramUser, get_current_user
from app.database import Database
from app.dependencies import get_database
from app.repositories.challenges import list_for_user
from app.schemas import AchievementResponse
from app.services.achievements import earned_achievements


router = APIRouter(tags=["achievements"])


@router.get(
    "/achievements",
    response_model=list[AchievementResponse],
)
async def get_achievements(
    telegram_user: TelegramUser = Depends(get_current_user),
    database: Database = Depends(get_database),
) -> list[AchievementResponse]:
    async with database.connection() as connection:
        challenges = await list_for_user(connection, telegram_user.id)

    return [
        AchievementResponse(**achievement)
        for achievement in earned_achievements(challenges)
    ]
