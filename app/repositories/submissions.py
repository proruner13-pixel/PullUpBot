import asyncpg


SUBMISSION_COLUMNS = """
    id,
    user_id,
    type,
    value,
    video_file_id,
    video_url,
    status,
    moderator_comment,
    created_at,
    reviewed_at
"""


async def create_submission(
    connection: asyncpg.Connection,
    *,
    telegram_id: int,
    submission_type: str,
    value: int,
    video_file_id: str | None,
    video_url: str | None,
) -> asyncpg.Record:
    return await connection.fetchrow(
        f"""
        INSERT INTO submissions (
            user_id,
            type,
            value,
            video_file_id,
            video_url
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING {SUBMISSION_COLUMNS}
        """,
        telegram_id,
        submission_type,
        value,
        video_file_id,
        video_url,
    )


async def create_webapp_pullup(
    connection: asyncpg.Connection,
    *,
    user_id: int,
    file_path: str | None,
    file_url: str | None,
    caption: str | None,
) -> asyncpg.Record:
    return await connection.fetchrow(
        """
        INSERT INTO pullups (
            user_id,
            video_file_id,
            file_path,
            file_url,
            source,
            caption,
            count,
            status,
            created_at
        )
        VALUES ($1, NULL, $2, $3, 'webapp', $4, NULL, 'pending', NOW())
        RETURNING
            id,
            user_id,
            video_file_id,
            file_path,
            file_url,
            source,
            caption,
            count,
            status,
            created_at
        """,
        user_id,
        file_path,
        file_url,
        caption,
    )


async def list_submissions(
    connection: asyncpg.Connection,
    *,
    telegram_id: int,
    limit: int,
    offset: int,
) -> list[asyncpg.Record]:
    return await connection.fetch(
        f"""
        SELECT {SUBMISSION_COLUMNS}
        FROM submissions
        WHERE user_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT $2 OFFSET $3
        """,
        telegram_id,
        limit,
        offset,
    )
