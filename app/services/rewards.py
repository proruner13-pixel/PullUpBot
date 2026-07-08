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
    thresholds = [0, 100, 250, 500, 1000]
    if total_xp < thresholds[-1]:
        level = 1
        for index, threshold in enumerate(thresholds, start=1):
            if total_xp >= threshold:
                level = index
        return level
    return 5 + floor((total_xp - thresholds[-1]) / 500)


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
        return max(floor(float(payload.get("distance_km", 0) or 0) * 10), 0)
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
            return max(floor(float(payload.get("distance_km", 0) or 0) * 10), 0)
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
        return floor(float(payload.get("distance_km", 0) or 0))
    if activity_type == "plank":
        return floor(int(payload.get("seconds", 0) or 0) / 60)
    raise ValueError(f"Unsupported activity_type: {activity_type}")


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

    return xp_amount
