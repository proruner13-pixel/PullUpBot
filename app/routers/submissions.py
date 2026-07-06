from fastapi import APIRouter, Depends, Query, status, UploadFile, File, Form

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
    type: str = Form(...),
    value: int = Form(...),
    video: UploadFile | None = File(default=None),
    video_url: str | None = Form(default=None),
    telegram_user: TelegramUser = Depends(get_current_user),
    database: Database = Depends(get_database),
) -> SubmissionResponse:
    """
    Отправляет видео на модерацию.
    Поддерживает загрузку видео файла или ссылку на трекер.
    """
    # Валидация типа
    valid_types = {"pullups", "pushups", "plank", "running"}
    if type not in valid_types:
        raise ValueError(f"type должно быть одним из: {valid_types}")

    # Валидация значения
    if value < 0:
        raise ValueError("value должно быть неотрицательным числом")

    video_file_id: str | None = None

    # Если загружен видео файл, сохраняем его и получаем file_id
    if video:
        # Для простоты, сохраняем только ссылку на временный файл
        # В production нужно загружать на облако (S3, GCS и т.д.)
        video_file_id = f"temp-{telegram_user.id}-{type}-{int(__import__('time').time())}"
        # TODO: Реализовать сохранение видео на облако

    async with database.connection() as connection:
        async with connection.transaction():
            await upsert_user(connection, telegram_user)
            submission = await create_submission(
                connection,
                telegram_id=telegram_user.id,
                submission_type=type,
                value=value,
                video_file_id=video_file_id,
                video_url=video_url,
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
