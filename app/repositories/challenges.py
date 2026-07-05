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
            CASE
                WHEN user_challenge.progress = 0 THEN 0
                ELSE 1 + (user_challenge.progress / challenge.goal)
            END::INTEGER AS level
        FROM user_challenges AS user_challenge
        JOIN challenges AS challenge
          ON challenge.id = user_challenge.challenge_id
        WHERE user_challenge.user_id = $1
          AND challenge.is_active
        ORDER BY challenge.slug
        """,
        telegram_id,
    )
