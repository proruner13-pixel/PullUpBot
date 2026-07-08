import asyncpg

from app.services.rewards import unlock_earned_achievements


async def ensure_for_user(
    connection: asyncpg.Connection,
    telegram_id: int,
) -> None:
    await unlock_earned_achievements(connection, telegram_id=telegram_id)


async def list_for_user(
    connection: asyncpg.Connection,
    telegram_id: int,
) -> list[asyncpg.Record]:
    return await connection.fetch(
        """
        SELECT
            achievement.slug AS code,
            achievement.title,
            achievement.icon
        FROM user_achievements AS user_achievement
        JOIN achievements AS achievement
          ON achievement.id = user_achievement.achievement_id
        WHERE user_achievement.user_id = $1
          AND achievement.is_active
        ORDER BY user_achievement.unlocked_at, achievement.slug
        """,
        telegram_id,
    )
