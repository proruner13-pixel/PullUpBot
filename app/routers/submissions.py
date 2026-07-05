from fastapi import APIRouter, Depends, Query, status

from app.auth import TelegramUser, get_current_user
from app.database import Database
from app.dependencies import get_database
from app.repositories.submissions import create_submission, list_submissions
from app.repositories.users import upsert_user
from app.schemas import SubmissionCreateRequest, SubmissionResponse


router = APIRouter(prefix="/submissions", tags=["submissions"])


@router.post(
    "",
    response_model=SubmissionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def submit_video(
    payload: SubmissionCreateRequest,
    telegram_user: TelegramUser = Depends(get_current_user),
    database: Database = Depends(get_database),
) -> SubmissionResponse:
    async with database.connection() as connection:
        async with connection.transaction():
            await upsert_user(connection, telegram_user)
            submission = await create_submission(
                connection,
                telegram_id=telegram_user.id,
                submission_type=payload.type,
                value=payload.value,
                video_file_id=payload.video_file_id,
                video_url=payload.video_url,
            )

    return SubmissionResponse(**dict(submission))


@router.get("", response_model=list[SubmissionResponse])
async def get_my_submissions(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    telegram_user: TelegramUser = Depends(get_current_user),
    database: Database = Depends(get_database),
) -> list[SubmissionResponse]:
    async with database.connection() as connection:
        submissions = await list_submissions(
            connection,
            telegram_id=telegram_user.id,
            limit=limit,
            offset=offset,
        )

    return [
        SubmissionResponse(**dict(submission))
        for submission in submissions
    ]
