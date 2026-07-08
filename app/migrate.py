import argparse
import asyncio
import re
from pathlib import Path

import asyncpg

from app.config import Settings


MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"
UP_PATTERN = re.compile(r"^(?P<version>\d+)_.+\.up\.sql$")


async def ensure_registry(connection: asyncpg.Connection) -> None:
    await connection.execute(
        """
        CREATE TABLE IF NOT EXISTS public.schema_migrations (
            version TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )


def available_migrations() -> list[tuple[str, Path]]:
    migrations = []
    for path in MIGRATIONS_DIR.glob("*.up.sql"):
        match = UP_PATTERN.match(path.name)
        if match:
            migrations.append((match.group("version"), path))
    return sorted(migrations, key=lambda item: int(item[0]))


async def status(connection: asyncpg.Connection) -> None:
    await ensure_registry(connection)
    applied = {
        row["version"]
        for row in await connection.fetch(
            "SELECT version FROM public.schema_migrations"
        )
    }

    highest_applied = max((int(version) for version in applied), default=0)
    for version, path in available_migrations():
        if version in applied:
            state = "applied"
        elif int(version) < highest_applied:
            state = "superseded"
        else:
            state = "pending"
        print(f"{version}: {state} ({path.name})")


async def preflight(connection: asyncpg.Connection) -> None:
    required_columns = {
        "users": {
            "id",
            "telegram_id",
            "username",
            "display_name",
            "tokens",
            "xp",
            "total_xp",
            "weekly_goal",
            "balance",
            "level",
            "ref_code",
            "referred_by",
            "referrals_count",
            "created_at",
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
            "rewards_applied",
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
            "rewards_applied",
        },
        "user_challenges": {
            "id",
            "user_id",
            "challenge_id",
            "progress",
            "xp",
            "level",
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
        "xp_transactions": {
            "id",
            "user_id",
            "challenge_key",
            "xp_amount",
            "source_type",
            "source_id",
            "created_at",
        },
    }

    for table, expected in required_columns.items():
        rows = await connection.fetch(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = $1
            """,
            table,
        )
        actual = {row["column_name"] for row in rows}
        missing = sorted(expected - actual)
        if missing:
            raise RuntimeError(
                f"Table public.{table} is missing columns: "
                f"{', '.join(missing)}"
            )
        print(f"public.{table}: compatible ({len(actual)} columns)")

    challenges_exists = await connection.fetchval(
        "SELECT to_regclass('public.challenges') IS NOT NULL"
    )
    users_count = await connection.fetchval("SELECT COUNT(*) FROM public.users")
    pullups_count = await connection.fetchval(
        "SELECT COUNT(*) FROM public.pullups"
    )
    approved_count = await connection.fetchval(
        """
        SELECT COUNT(*)
        FROM public.pullups
        WHERE status = 'approved'
        """
    )

    print(f"public.challenges exists: {challenges_exists}")
    print(f"users: {users_count}")
    print(f"pullups: {pullups_count}")
    print(f"approved pullups: {approved_count}")


async def verify(connection: asyncpg.Connection) -> None:
    applied = {
        row["version"]
        for row in await connection.fetch(
            "SELECT version FROM public.schema_migrations"
        )
    }
    missing_versions = {"002", "003", "004", "005"} - applied
    if missing_versions:
        raise RuntimeError(
            "Required migrations are not recorded: "
            + ", ".join(sorted(missing_versions))
        )

    submission_constraint = await connection.fetchval(
        """
        SELECT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conrelid = 'public.submissions'::regclass
              AND conname = 'ck_submissions_type'
              AND convalidated
        )
        """
    )
    if not submission_constraint:
        raise RuntimeError("Validated submission type constraint is missing")

    idempotency_index = await connection.fetchval(
        """
        SELECT to_regclass(
            'public.uq_token_transactions_submission'
        ) IS NOT NULL
        """
    )
    if not idempotency_index:
        raise RuntimeError("Submission token idempotency index is missing")

    xp_index = await connection.fetchval(
        """
        SELECT to_regclass(
            'public.uq_xp_transactions_reward_source'
        ) IS NOT NULL
        """
    )
    if not xp_index:
        raise RuntimeError("XP reward idempotency index is missing")

    print("Migrations 002, 003, 004, and 005 are applied")
    print("Submission type constraint is valid")
    print("Submission token idempotency index exists")
    print("XP reward idempotency index exists")


async def migrate_up(connection: asyncpg.Connection) -> None:
    await ensure_registry(connection)
    applied = {
        row["version"]
        for row in await connection.fetch(
            "SELECT version FROM public.schema_migrations"
        )
    }

    pending = [
        (version, path)
        for version, path in available_migrations()
        if version not in applied
        and int(version) > max(
            (int(applied_version) for applied_version in applied),
            default=0,
        )
    ]
    if not pending:
        print("No pending migrations")
        return

    for version, path in pending:
        await connection.execute(path.read_text(encoding="utf-8"))
        print(f"Applied migration {version}: {path.name}")


async def migrate_down(connection: asyncpg.Connection) -> None:
    await ensure_registry(connection)
    latest = await connection.fetchrow(
        """
        SELECT version
        FROM public.schema_migrations
        ORDER BY applied_at DESC, version DESC
        LIMIT 1
        """
    )
    if latest is None:
        print("No applied migrations")
        return

    version = latest["version"]
    matching = list(MIGRATIONS_DIR.glob(f"{version}_*.down.sql"))
    if len(matching) != 1:
        raise RuntimeError(
            f"Expected one down migration for version {version}, "
            f"found {len(matching)}"
        )

    await connection.execute(matching[0].read_text(encoding="utf-8"))
    print(f"Reverted migration {version}: {matching[0].name}")


async def run(command: str) -> None:
    settings = Settings.from_env()
    connection = await asyncpg.connect(settings.database_dsn)
    try:
        if command == "preflight":
            await preflight(connection)
        elif command == "verify":
            await verify(connection)
        elif command == "status":
            await status(connection)
        elif command == "up":
            await migrate_up(connection)
        elif command == "down":
            await migrate_down(connection)
    finally:
        await connection.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="PULLUP database migrations")
    parser.add_argument(
        "command",
        choices=("preflight", "verify", "status", "up", "down"),
    )
    args = parser.parse_args()
    asyncio.run(run(args.command))


if __name__ == "__main__":
    main()
