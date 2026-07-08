from collections.abc import Mapping

import asyncpg


REQUIRED_COLUMNS: Mapping[str, set[str]] = {
    "users": {
        "id",
        "telegram_id",
        "username",
        "display_name",
        "first_name",
        "last_name",
        "avatar_url",
        "tokens",
        "level",
        "weekly_goal",
        "streak_days",
        "ref_code",
        "referred_by",
        "referrals_count",
        "created_at",
        "updated_at",
    },
    "pullups": {
        "id",
        "user_id",
        "video_file_id",
        "file_path",
        "file_url",
        "source",
        "caption",
        "count",
        "status",
        "moderator_id",
        "reject_reason",
        "created_at",
        "moderated_at",
    },
    "submissions": {
        "id",
        "user_id",
        "type",
        "value",
        "video_file_id",
        "video_url",
        "status",
        "moderator_comment",
        "created_at",
        "reviewed_at",
    },
    "user_challenges": {
        "id",
        "user_id",
        "challenge_id",
        "progress",
        "completed",
        "completed_at",
        "created_at",
    },
    "token_transactions": {
        "id",
        "user_id",
        "amount",
        "reason",
        "source_type",
        "source_id",
        "created_at",
    },
}


class SchemaMismatchError(RuntimeError):
    """Raised when the database schema is older than the application code."""


async def fetch_table_columns(
    connection: asyncpg.Connection,
    table_name: str,
) -> set[str]:
    rows = await connection.fetch(
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        """,
        table_name,
    )
    return {row["column_name"] for row in rows}


async def find_missing_columns(
    connection: asyncpg.Connection,
) -> dict[str, list[str]]:
    missing_by_table: dict[str, list[str]] = {}
    for table_name, expected_columns in REQUIRED_COLUMNS.items():
        actual_columns = await fetch_table_columns(connection, table_name)
        missing = sorted(expected_columns - actual_columns)
        if missing:
            missing_by_table[table_name] = missing
    return missing_by_table


def format_schema_mismatch(missing_by_table: Mapping[str, list[str]]) -> str:
    details = "; ".join(
        f"public.{table}: {', '.join(columns)}"
        for table, columns in missing_by_table.items()
    )
    return (
        "Database schema is not compatible with this backend. "
        f"Missing columns: {details}. Run pending migrations before startup."
    )


async def validate_required_schema(connection: asyncpg.Connection) -> None:
    missing_by_table = await find_missing_columns(connection)
    if missing_by_table:
        raise SchemaMismatchError(format_schema_mismatch(missing_by_table))
