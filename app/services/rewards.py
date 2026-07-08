from __future__ import annotations

from math import floor
from typing import Any, Mapping

import asyncpg


SUPPORTED_ACTIVITIES = {"pullups", "pushups", "running", "plank"}
ACTIVITY_ALIASES = {
    "pullup": "pullups",
    "pullups": "pullups",
    "pushup": "pushups",
    "pushups": "pushups",
    "run": "running",
    "running": "running",
    "plank": "plank",
}


class RewardsAlreadyAppliedError(Exception):
    """Raised when a workout reward source has already been processed."""


def normalize_activity_type(activity_type: str) -> str:
    normalized = ACTIVITY_ALIASES.get(activity_type)
    if not normalized:
        raise ValueError(f"Unsupported activity_type: {activity_type}")
    return normalized


def calculate_level(total_xp: int) -> int:
    total_xp = max(int(total_xp or 0), 0)
    return floor(total_xp / 100) + 1


def calculateLevel(totalXp: int) -> int:
    return calculate_level(totalXp)


def calculate_pullup_reward(
    activity_type: str,
    payload: Mapping[str, Any],
) -> int:
    activity_type = normalize_activity_type(activity_type)
    if activity_type in {"pullups", "pushups"}:
        return max(int(payload.get("reps", 0) or 0), 0)
    if activity_type == "running":
        distance_km = payload.get("distance_km")
        if distance_km is None and payload.get("distance_m") is not None:
            distance_km = float(payload.get("distance_m", 0) or 0) / 1000
        return max(round(float(distance_km or 0) * 10), 0)
    if activity_type == "plank":
        return max(floor(int(payload.get("seconds", 0) or 0) / 10), 0)
    raise ValueError(f"Unsupported activity_type: {activity_type}")


def calculate_xp_reward(
    activity_type: str,
    pullup_earned: int,
    payload: Mapping[str, Any] | None = None,
) -> int:
    activity_type = normalize_activity_type(activity_type)
    if activity_type == "pullups":
        return max(pullup_earned, 0) * 2
    if activity_type == "pushups":
        return max(pullup_earned, 0)
    if activity_type == "running":
        if payload is not None:
            distance_km = payload.get("distance_km")
            if distance_km is None and payload.get("distance_m") is not None:
                distance_km = float(payload.get("distance_m", 0) or 0) / 1000
            return max(round(float(distance_km or 0) * 10), 0)
        return max(pullup_earned, 0)
    if activity_type == "plank":
        if payload is not None:
            return max(floor(int(payload.get("seconds", 0) or 0) / 10), 0)
        return max(pullup_earned, 0)
    raise ValueError(f"Unsupported activity_type: {activity_type}")


def calculate_xp(
    activity_type: str,
    tokens_earned: int,
    payload: Mapping[str, Any] | None = None,
) -> int:
    return calculate_xp_reward(activity_type, tokens_earned, payload)


def progress_value(activity_type: str, payload: Mapping[str, Any]) -> int:
    activity_type = normalize_activity_type(activity_type)
    if activity_type in {"pullups", "pushups"}:
        return int(payload.get("reps", 0) or 0)
    if activity_type == "running":
        distance_km = payload.get("distance_km")
        if distance_km is None and payload.get("distance_m") is not None:
            distance_km = float(payload.get("distance_m", 0) or 0) / 1000
        return round(float(distance_km or 0))
    if activity_type == "plank":
        return int(payload.get("seconds", 0) or 0)
    raise ValueError(f"Unsupported activity_type: {activity_type}")


async def unlock_earned_achievements(
    connection: asyncpg.Connection,
    *,
    telegram_id: int,
) -> list[asyncpg.Record]:
    return await connection.fetch(
        """
        WITH user_totals AS (
            SELECT
                app_user.telegram_id,
                app_user.tokens,
                app_user.level,
                COUNT(submission.id) FILTER (
                    WHERE submission.status = 'approved'
                ) AS result_count,
                COALESCE(SUM(user_challenge.progress) FILTER (
                    WHERE challenge.slug IN ('pullups', 'pushups', 'plank', 'running')
                      AND user_challenge.progress > 0
                ), 0) AS sport_count_raw,
                COALESCE(MAX(user_challenge.progress) FILTER (
                    WHERE challenge.slug = 'pullups'
                ), 0) AS total_pullups,
                COALESCE(MAX(user_challenge.progress) FILTER (
                    WHERE challenge.slug = 'pushups'
                ), 0) AS total_pushups,
                COALESCE(MAX(user_challenge.progress) FILTER (
                    WHERE challenge.slug = 'running'
                ), 0) AS total_running,
                COALESCE(MAX(user_challenge.progress) FILTER (
                    WHERE challenge.slug = 'plank'
                ), 0) AS total_plank
            FROM users AS app_user
            LEFT JOIN submissions AS submission
              ON submission.user_id = app_user.telegram_id
            LEFT JOIN user_challenges AS user_challenge
              ON user_challenge.user_id = app_user.telegram_id
            LEFT JOIN challenges AS challenge
              ON challenge.id = user_challenge.challenge_id
            WHERE app_user.telegram_id = $1
            GROUP BY app_user.telegram_id, app_user.tokens, app_user.level
        ),
        eligible AS (
            SELECT achievement.id
            FROM achievements AS achievement
            CROSS JOIN user_totals
            WHERE achievement.is_active
              AND CASE achievement.requirement_type
                    WHEN 'first_pullup_submission' THEN user_totals.total_pullups >= 1
                    WHEN 'total_pullups' THEN user_totals.total_pullups >= achievement.requirement_value
                    WHEN 'total_pushups' THEN user_totals.total_pushups >= achievement.requirement_value
                    WHEN 'total_running_km' THEN user_totals.total_running >= achievement.requirement_value
                    WHEN 'total_plank_seconds' THEN user_totals.total_plank >= achievement.requirement_value
                    WHEN 'result_count' THEN user_totals.result_count >= achievement.requirement_value
                    WHEN 'tokens' THEN user_totals.tokens >= achievement.requirement_value
                    WHEN 'level' THEN user_totals.level >= achievement.requirement_value
                    WHEN 'sport_count' THEN (
                        SELECT COUNT(*)
                        FROM user_challenges AS uc
                        JOIN challenges AS c ON c.id = uc.challenge_id
                        WHERE uc.user_id = user_totals.telegram_id
                          AND c.slug IN ('pullups', 'pushups', 'plank', 'running')
                          AND uc.progress > 0
                    ) >= achievement.requirement_value
                    WHEN 'best_pullups' THEN user_totals.total_pullups >= achievement.requirement_value
                    WHEN 'best_pushups' THEN user_totals.total_pushups >= achievement.requirement_value
                    WHEN 'best_running' THEN user_totals.total_running >= achievement.requirement_value
                    WHEN 'best_plank' THEN floor(user_totals.total_plank / 60) >= achievement.requirement_value
                    ELSE FALSE
                  END
        ),
        inserted AS (
            INSERT INTO user_achievements (user_id, achievement_id)
            SELECT $1, eligible.id
            FROM eligible
            ON CONFLICT (user_id, achievement_id) DO NOTHING
            RETURNING achievement_id
        )
        SELECT
            achievement.slug AS code,
            achievement.title,
            achievement.icon
        FROM inserted
        JOIN achievements AS achievement
          ON achievement.id = inserted.achievement_id
        ORDER BY achievement.slug
        """,
        telegram_id,
    )


async def apply_workout_rewards(
    connection: asyncpg.Connection,
    *,
    user_id: int,
    activity_type: str,
    payload: Mapping[str, Any],
    source_type: str,
    source_id: int | None,
    update_progress: bool = True,
    tokens_earned: int | None = None,
) -> int:
    activity_type = normalize_activity_type(activity_type)
    if activity_type not in SUPPORTED_ACTIVITIES:
        raise ValueError(f"Unsupported activity_type: {activity_type}")

    pullup_amount = (
        tokens_earned
        if tokens_earned is not None
        else calculate_pullup_reward(activity_type, payload)
    )
    xp_amount = calculate_xp_reward(activity_type, pullup_amount, payload)
    progress = progress_value(activity_type, payload)

    user = await connection.fetchrow(
        """
        SELECT id, telegram_id, COALESCE(xp, total_xp, 0) AS xp
        FROM users
        WHERE id = $1
        FOR UPDATE
        """,
        user_id,
    )
    if user is None:
        raise ValueError(f"User {user_id} not found")

    inserted_token = await connection.fetchrow(
        """
        INSERT INTO token_transactions (
            user_id,
            amount,
            reason,
            source_type,
            source_id
        )
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT DO NOTHING
        RETURNING id
        """,
        user["telegram_id"],
        pullup_amount,
        f"{activity_type} reward",
        source_type,
        source_id,
    )
    if inserted_token is None:
        raise RewardsAlreadyAppliedError(
            f"Rewards already applied for {source_type}:{source_id}"
        )

    new_total_xp = int(user["xp"] or 0) + xp_amount
    new_level = calculate_level(new_total_xp)

    await connection.execute(
        """
        UPDATE users
        SET tokens = tokens + $2,
            xp = COALESCE(xp, 0) + $3,
            total_xp = COALESCE(total_xp, 0) + $3,
            level = $4
        WHERE id = $1
        """,
        user_id,
        pullup_amount,
        xp_amount,
        new_level,
    )

    challenge_result = await connection.execute(
        """
        INSERT INTO user_challenges (
            user_id,
            challenge_id,
            progress,
            xp,
            level
        )
        SELECT
            $1,
            challenge.id,
            $3,
            $4,
            ($4 / 100) + 1
        FROM challenges AS challenge
        WHERE challenge.slug = $2
        ON CONFLICT (user_id, challenge_id) DO UPDATE
        SET progress = CASE
                WHEN $5 THEN user_challenges.progress + EXCLUDED.progress
                ELSE user_challenges.progress
            END,
            xp = user_challenges.xp + EXCLUDED.xp,
            level = ((user_challenges.xp + EXCLUDED.xp) / 100) + 1,
            completed = CASE
                WHEN $5
                    THEN (user_challenges.progress + EXCLUDED.progress) >= (
                        SELECT goal FROM challenges WHERE id = EXCLUDED.challenge_id
                    )
                ELSE user_challenges.completed
            END,
            completed_at = CASE
                WHEN $5
                 AND (user_challenges.progress + EXCLUDED.progress) >= (
                        SELECT goal FROM challenges WHERE id = EXCLUDED.challenge_id
                    )
                    THEN COALESCE(user_challenges.completed_at, NOW())
                WHEN $5 THEN NULL
                ELSE user_challenges.completed_at
            END
        """,
        user["telegram_id"],
        activity_type,
        progress,
        xp_amount,
        update_progress,
    )
    if challenge_result == "INSERT 0 0":
        raise ValueError(f"Challenge {activity_type} not found")

    await connection.execute(
        """
        INSERT INTO xp_transactions (
            user_id,
            challenge_key,
            xp_amount,
            source_type,
            source_id
        )
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT DO NOTHING
        """,
        user_id,
        activity_type,
        xp_amount,
        source_type,
        source_id,
    )

    await unlock_earned_achievements(
        connection,
        telegram_id=user["telegram_id"],
    )

    return xp_amount
