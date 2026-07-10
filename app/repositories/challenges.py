import asyncpg


async def list_active_catalog(
    connection: asyncpg.Connection,
) -> list[asyncpg.Record]:
    return await connection.fetch(
        """
        SELECT
            id,
            slug,
            title,
            description,
            type AS exercise_type,
            goal AS target_value,
            reward_tokens,
            is_active,
            created_at
        FROM challenges
        WHERE is_active
        ORDER BY id
        """
    )


async def list_for_user(
    connection: asyncpg.Connection,
    telegram_id: int,
) -> list[asyncpg.Record]:
    return await connection.fetch(
        """
        SELECT
            challenge.id,
            challenge.slug AS exercise,
            challenge.slug,
            challenge.title,
            challenge.description,
            COALESCE(user_challenge.progress, 0)::INTEGER AS progress,
            challenge.goal,
            challenge.reward_tokens,
            challenge.is_active,
            COALESCE(user_challenge.xp, 0)::INTEGER AS xp,
            COALESCE(user_challenge.level, 1)::INTEGER AS level,
            (COALESCE(user_challenge.xp, 0) % 1000)::INTEGER AS next_level_progress,
            COALESCE(user_challenge.completed, FALSE)::BOOLEAN AS completed,
            CASE
                WHEN COALESCE(user_challenge.completed, FALSE) THEN 'completed'
                WHEN challenge.is_active THEN 'active'
                ELSE 'inactive'
            END AS status
        FROM challenges AS challenge
        LEFT JOIN user_challenges AS user_challenge
          ON user_challenge.challenge_id = challenge.id
         AND user_challenge.user_id = $1
        WHERE challenge.is_active
           OR COALESCE(user_challenge.completed, FALSE)
        ORDER BY challenge.slug
        """,
        telegram_id,
    )
