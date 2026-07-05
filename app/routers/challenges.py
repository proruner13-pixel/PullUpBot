from fastapi import APIRouter, Depends

from app.auth import TelegramUser, get_current_user
from app.database import Database
from app.dependencies import get_database
from app.repositories.challenges import list_for_user
from app.schemas import ChallengeResponse


router = APIRouter(tags=["challenges"])


@router.get("/challenges", response_model=list[ChallengeResponse])
async def get_challenges(
    telegram_user: TelegramUser = Depends(get_current_user),
    database: Database = Depends(get_database),
) -> list[ChallengeResponse]:
    async with database.connection() as connection:
        challenges = await list_for_user(connection, telegram_user.id)
    return [ChallengeResponse(**dict(challenge)) for challenge in challenges]
