from fastapi import APIRouter, Depends
import logging

from app.auth import TelegramUser, get_current_user
from app.database import Database
from app.dependencies import get_database
from app.repositories.challenges import list_for_user
from app.schemas import ChallengeResponse


router = APIRouter(tags=["challenges"])
logger = logging.getLogger("pullup.api")


def _challenge_value(challenge: object, *keys: str) -> str:
    for key in keys:
        try:
            value = challenge[key]  # type: ignore[index]
        except (KeyError, TypeError):
            continue
        if value is not None:
            return str(value)
    return ""


@router.get("/challenges", response_model=list[ChallengeResponse])
async def get_challenges(
    telegram_user: TelegramUser = Depends(get_current_user),
    database: Database = Depends(get_database),
) -> list[ChallengeResponse]:
    async with database.connection() as connection:
        challenges = await list_for_user(connection, telegram_user.id)
    slugs = [_challenge_value(challenge, "slug", "exercise") for challenge in challenges]
    exercise_types = [
        _challenge_value(challenge, "exercise", "exercise_type")
        for challenge in challenges
    ]
    logger.info(
        "CHALLENGES_RESPONSE telegram_id=%s user_id=%s count=%s slugs=[%s] exercise_types=[%s]",
        telegram_user.id,
        telegram_user.id,
        len(challenges),
        ",".join(slugs),
        ",".join(exercise_types),
    )
    return [ChallengeResponse(**dict(challenge)) for challenge in challenges]
