import asyncpg


async def list_for_user(
    connection: asyncpg.Connection,
    telegram_id: int,
) -> list[asyncpg.Record]:
    return await connection.fetch(
        """
        SELECT
            challenge.slug AS exercise,
            user_challenge.progress,
            challenge.goal,
            user_challenge.xp,
            user_challenge.level,
            (user_challenge.xp % 100)::INTEGER AS next_level_progress
        FROM user_challenges AS user_challenge
        JOIN challenges AS challenge
          ON challenge.id = user_challenge.challenge_id
        WHERE user_challenge.user_id = $1
          AND challenge.is_active
        ORDER BY challenge.slug
        """,
        telegram_id,
    )
