import asyncpg


LEADERBOARD_CTE = """
WITH approved_submissions AS (
    SELECT
        user_id AS telegram_id,
        COUNT(*)::INTEGER AS approved_count
    FROM submissions
    WHERE status = 'approved'
    GROUP BY user_id
),
approved_pullups AS (
    SELECT
        users.telegram_id,
        COUNT(*)::INTEGER AS approved_count
    FROM pullups
    JOIN users ON users.id = pullups.user_id
    WHERE pullups.status = 'approved'
    GROUP BY users.telegram_id
),
ranked_users AS (
    SELECT
        ROW_NUMBER() OVER (
            ORDER BY
                GREATEST(COALESCE(users.total_xp, 0), COALESCE(users.xp, 0)) DESC,
                COALESCE(users.tokens, 0) DESC,
                (
                    COALESCE(approved_submissions.approved_count, 0) +
                    COALESCE(approved_pullups.approved_count, 0)
                ) DESC,
                users.created_at ASC,
                users.id ASC
        )::INTEGER AS rank,
        COUNT(*) OVER ()::INTEGER AS total_users,
        users.id,
        users.telegram_id,
        users.username,
        users.first_name,
        users.avatar_url,
        GREATEST(COALESCE(users.total_xp, 0), COALESCE(users.xp, 0))::INTEGER AS xp,
        (
            GREATEST(COALESCE(users.total_xp, 0), COALESCE(users.xp, 0)) / 1000
        + 1)::INTEGER AS level,
        COALESCE(users.tokens, 0)::INTEGER AS balance,
        (
            COALESCE(approved_submissions.approved_count, 0) +
            COALESCE(approved_pullups.approved_count, 0)
        )::INTEGER AS approved_workouts
    FROM users
    LEFT JOIN approved_submissions
        ON approved_submissions.telegram_id = users.telegram_id
    LEFT JOIN approved_pullups
        ON approved_pullups.telegram_id = users.telegram_id
    WHERE users.telegram_id <> 123456789
)
"""


async def list_leaderboard(
    connection: asyncpg.Connection,
    *,
    limit: int = 50,
    offset: int = 0,
) -> list[asyncpg.Record]:
    return await connection.fetch(
        f"""
        {LEADERBOARD_CTE}
        SELECT
            rank,
            id,
            telegram_id,
            username,
            first_name,
            avatar_url,
            xp,
            level,
            balance,
            approved_workouts
        FROM ranked_users
        ORDER BY rank ASC
        LIMIT $1 OFFSET $2
        """,
        limit,
        offset,
    )


async def get_total_users(connection: asyncpg.Connection) -> int:
    return await connection.fetchval(
        """
        SELECT COUNT(*)::INTEGER
        FROM users
        WHERE telegram_id <> 123456789
        """
    )


async def get_my_leaderboard_rank(
    connection: asyncpg.Connection,
    *,
    telegram_id: int,
) -> asyncpg.Record | None:
    return await connection.fetchrow(
        f"""
        {LEADERBOARD_CTE}
        SELECT
            rank,
            total_users,
            GREATEST(total_users - rank, 0)::INTEGER AS users_below,
            GREATEST(rank - 1, 0)::INTEGER AS users_above,
            id,
            telegram_id,
            username,
            first_name,
            avatar_url,
            xp,
            level,
            balance,
            approved_workouts
        FROM ranked_users
        WHERE telegram_id = $1
        """,
        telegram_id,
    )


async def list_leaderboard_around_user(
    connection: asyncpg.Connection,
    *,
    telegram_id: int,
    radius: int = 3,
) -> list[asyncpg.Record]:
    return await connection.fetch(
        f"""
        {LEADERBOARD_CTE},
        current_user_rank AS (
            SELECT rank
            FROM ranked_users
            WHERE telegram_id = $1
        )
        SELECT
            ranked_users.rank,
            ranked_users.id,
            ranked_users.telegram_id,
            ranked_users.username,
            ranked_users.first_name,
            ranked_users.avatar_url,
            ranked_users.xp,
            ranked_users.level,
            ranked_users.balance,
            ranked_users.approved_workouts,
            (ranked_users.telegram_id = $1)::BOOLEAN AS is_current_user
        FROM ranked_users
        CROSS JOIN current_user_rank
        WHERE ranked_users.rank BETWEEN
            GREATEST(current_user_rank.rank - $2, 1)
            AND current_user_rank.rank + $2
        ORDER BY ranked_users.rank ASC
        """,
        telegram_id,
        radius,
    )
