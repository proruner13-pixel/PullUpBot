import logging
import re
import time
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, Query, status, UploadFile, File, Form
from fastapi import HTTPException, Request
from pydantic import ValidationError

from app.auth import TelegramUser, get_current_user
from app.database import Database
from app.dependencies import get_database
from app.repositories.submissions import (
    create_submission,
    create_webapp_pullup,
    list_submissions,
)
from app.repositories.users import upsert_user
from app.schemas import SubmissionCreateRequest, SubmissionResponse


router = APIRouter(prefix="/submissions", tags=["submissions"])
logger = logging.getLogger("pullup.api.submissions")

MAX_UPLOAD_BYTES = 100 * 1024 * 1024


def _safe_filename(filename: str | None) -> str:
    original = Path(filename or "video.mp4").name
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", original).strip("._")
    return cleaned or "video.mp4"


async def _save_upload(
    video: UploadFile,
    telegram_id: int,
    upload_dir: Path,
) -> tuple[str, str, int]:
    upload_root = upload_dir / "submissions"
    upload_root.mkdir(parents=True, exist_ok=True)
    filename = f"{int(time.time())}-{telegram_id}-{uuid4().hex}-{_safe_filename(video.filename)}"
    destination = upload_root / filename

    size = 0
    try:
        with destination.open("wb") as file:
            while chunk := await video.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail="Видео слишком большое. Максимальный размер: 100 МБ.",
                    )
                file.write(chunk)
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    finally:
        await video.close()

    if not destination.exists():
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Видео не сохранилось на сервере",
        )

    relative_path = Path("submissions") / filename
    return str(destination), relative_path.as_posix(), size


@router.post(
    "",
    response_model=SubmissionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def submit_video(
    request: Request,
    type: str = Form(...),
    value: int = Form(...),
    video: UploadFile | None = File(default=None),
    video_url: str | None = Form(default=None),
    caption: str | None = Form(default=None),
    telegram_user: TelegramUser = Depends(get_current_user),
    database: Database = Depends(get_database),
) -> SubmissionResponse:
    """
    Отправляет видео на модерацию.
    Поддерживает загрузку видео файла или ссылку на трекер.
    """
    logger.info(
        "WEBAPP_VIDEO_UPLOAD_STARTED telegram_id=%s type=%s has_video=%s has_video_url=%s",
        telegram_user.id,
        type,
        bool(video),
        bool(video_url),
    )

    try:
        payload = SubmissionCreateRequest(
            type=type,
            value=value,
            video_file_id="webapp-upload" if video else None,
            video_url=video_url,
        )
    except ValidationError as exc:
        logger.exception("WEBAPP_VIDEO_UPLOAD_FAILED telegram_id=%s", telegram_user.id)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    logger.info("WEBAPP_VIDEO_AUTH_OK telegram_id=%s", telegram_user.id)
    file_path: str | None = None
    file_url: str | None = video_url

    try:
        if video:
            upload_dir = request.app.state.settings.upload_dir
            file_path, relative_url_path, file_size = await _save_upload(
                video,
                telegram_user.id,
                upload_dir,
            )
            file_url = str(request.url_for("uploads", path=relative_url_path))
            logger.info(
                "SUBMISSION_VIDEO_SAVED telegram_id=%s file_path=%s size=%s video_url=%s",
                telegram_user.id,
                file_path,
                file_size,
                file_url,
            )

        async with database.connection() as connection:
            async with connection.transaction():
                user = await upsert_user(connection, telegram_user)
                submission = await create_submission(
                    connection,
                    telegram_id=telegram_user.id,
                    submission_type=payload.type,
                    value=payload.value,
                    video_file_id=None,
                    video_url=file_url,
                )
                if payload.type == "pullups":
                    pullup = await create_webapp_pullup(
                        connection,
                        user_id=user["id"],
                        file_path=file_path,
                        file_url=file_url,
                        caption=caption or f"{payload.type}: {payload.value}",
                    )
                    logger.info(
                        "WEBAPP_PULLUP_INSERTED telegram_id=%s user_id=%s pullup_id=%s source=webapp",
                        telegram_user.id,
                        user["id"],
                        pullup["id"],
                    )
    except HTTPException:
        logger.exception("WEBAPP_VIDEO_UPLOAD_FAILED telegram_id=%s", telegram_user.id)
        raise
    except Exception as exc:
        logger.exception("WEBAPP_VIDEO_UPLOAD_FAILED telegram_id=%s", telegram_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Видео не удалось отправить",
        ) from exc

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
