import asyncpg

from app.auth import TelegramUser


async def upsert_user(
    connection: asyncpg.Connection,
    telegram_user: TelegramUser,
) -> asyncpg.Record:
    return await connection.fetchrow(
        """
        INSERT INTO users (
            telegram_id,
            username,
            display_name,
            first_name,
            last_name,
            avatar_url
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (telegram_id) DO UPDATE SET
            username = EXCLUDED.username,
            display_name = COALESCE(users.display_name, EXCLUDED.display_name),
            first_name = EXCLUDED.first_name,
            last_name = EXCLUDED.last_name,
            avatar_url = EXCLUDED.avatar_url,
            updated_at = NOW()
        RETURNING
            id,
            telegram_id,
            display_name,
            username,
            first_name,
            last_name,
            avatar_url,
            tokens,
            balance,
            xp,
            total_xp,
            level,
            (COALESCE(xp, total_xp, 0) % 100)::INTEGER AS next_level_progress,
            streak_days,
            ref_code,
            referred_by,
            referrals_count
        """,
        telegram_user.id,
        telegram_user.username,
        telegram_user.display_name,
        telegram_user.first_name,
        telegram_user.last_name,
        telegram_user.photo_url,
    )


async def get_profile(
    connection: asyncpg.Connection,
    telegram_id: int,
) -> asyncpg.Record | None:
    return await connection.fetchrow(
        """
        SELECT
            telegram_id,
            username,
            first_name,
            last_name,
            avatar_url,
            tokens,
            balance,
            xp,
            total_xp,
            level,
            (COALESCE(xp, total_xp, 0) % 100)::INTEGER AS next_level_progress,
            streak_days,
            ref_code,
            referred_by
        FROM users
        WHERE telegram_id = $1
        """,
        telegram_id,
    )


async def update_avatar(
    connection: asyncpg.Connection,
    telegram_id: int,
    avatar_url: str,
) -> asyncpg.Record:
    return await connection.fetchrow(
        """
        UPDATE users
        SET avatar_url = $2,
            updated_at = NOW()
        WHERE telegram_id = $1
        RETURNING
            telegram_id,
            username,
            first_name,
            last_name,
            avatar_url,
            tokens,
            balance,
            xp,
            total_xp,
            level,
            (COALESCE(xp, total_xp, 0) % 100)::INTEGER AS next_level_progress,
            streak_days,
            ref_code,
            referred_by
        """,
        telegram_id,
        avatar_url,
    )
