BEGIN;

SELECT pg_advisory_xact_lock(hashtext('pullup_schema_migrations'));

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.schema_migrations
        WHERE version = '004'
    ) THEN
        RAISE EXCEPTION 'Migration 004 must be applied before 005';
    END IF;
END
$$;

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS xp INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_xp INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1;

UPDATE public.users
SET xp = total_xp
WHERE xp = 0 AND total_xp <> 0;

UPDATE public.users
SET total_xp = xp
WHERE total_xp = 0 AND xp <> 0;

ALTER TABLE public.user_challenges
    ADD COLUMN IF NOT EXISTS xp INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.pullups
    ADD COLUMN IF NOT EXISTS rewards_applied BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.submissions
    ADD COLUMN IF NOT EXISTS rewards_applied BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS public.xp_transactions (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    challenge_key TEXT NOT NULL,
    xp_amount INTEGER NOT NULL,
    source_type TEXT NOT NULL,
    source_id INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_xp_transactions_reward_source
    ON public.xp_transactions (source_type, source_id)
    WHERE source_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_token_transactions_reward_source
    ON public.token_transactions (source_type, source_id)
    WHERE source_id IS NOT NULL
      AND source_type IN ('submission', 'pullup');

INSERT INTO public.achievements (
    slug,
    title,
    description,
    category,
    icon,
    requirement_type,
    requirement_value,
    reward_tokens,
    is_active
)
VALUES
    ('first_pullup_submission', 'Первое подтягивание', 'Первая одобренная тренировка по подтягиваниям', 'pullups', '💪', 'first_pullup_submission', 1, 0, TRUE),
    ('pullups_10', '10 подтягиваний', 'Суммарно 10 подтягиваний', 'pullups', '🔟', 'total_pullups', 10, 0, TRUE),
    ('pullups_50', '50 подтягиваний', 'Суммарно 50 подтягиваний', 'pullups', '🏆', 'total_pullups', 50, 0, TRUE),
    ('pullups_100', '100 подтягиваний', 'Суммарно 100 подтягиваний', 'pullups', '👑', 'total_pullups', 100, 0, TRUE),
    ('pushups_50', '50 отжиманий', 'Суммарно 50 отжиманий', 'pushups', '🔥', 'total_pushups', 50, 0, TRUE),
    ('pushups_100', '100 отжиманий', 'Суммарно 100 отжиманий', 'pushups', '💥', 'total_pushups', 100, 0, TRUE),
    ('run_1km', 'Первый километр', 'Суммарно 1 км бега', 'running', '🏃', 'total_running_km', 1, 0, TRUE),
    ('run_10km', '10 км', 'Суммарно 10 км бега', 'running', '⚡', 'total_running_km', 10, 0, TRUE),
    ('run_50km', '50 км', 'Суммарно 50 км бега', 'running', '🥇', 'total_running_km', 50, 0, TRUE),
    ('plank_60s', '60 секунд планки', 'Суммарно 60 секунд планки', 'plank', '🧘', 'total_plank_seconds', 60, 0, TRUE),
    ('plank_300s', '300 секунд планки', 'Суммарно 300 секунд планки', 'plank', '🧱', 'total_plank_seconds', 300, 0, TRUE)
ON CONFLICT (slug) DO UPDATE
SET title = EXCLUDED.title,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    icon = EXCLUDED.icon,
    requirement_type = EXCLUDED.requirement_type,
    requirement_value = EXCLUDED.requirement_value,
    reward_tokens = EXCLUDED.reward_tokens,
    is_active = EXCLUDED.is_active;

WITH approved_pullups AS (
    SELECT
        pullup.user_id AS internal_user_id,
        COALESCE(SUM(COALESCE(pullup.count, 0)), 0)::INTEGER AS reps
    FROM public.pullups AS pullup
    WHERE pullup.status = 'approved'
    GROUP BY pullup.user_id
),
approved_submissions AS (
    SELECT
        submission.user_id AS telegram_id,
        COALESCE(SUM(CASE WHEN submission.type = 'pullups' THEN submission.value ELSE 0 END), 0)::INTEGER AS pullups,
        COALESCE(SUM(CASE WHEN submission.type = 'pushups' THEN submission.value ELSE 0 END), 0)::INTEGER AS pushups,
        COALESCE(SUM(CASE WHEN submission.type = 'running' THEN submission.value ELSE 0 END), 0)::INTEGER AS running_km,
        COALESCE(SUM(CASE WHEN submission.type = 'plank' THEN submission.value ELSE 0 END), 0)::INTEGER AS plank_seconds
    FROM public.submissions AS submission
    WHERE submission.status = 'approved'
    GROUP BY submission.user_id
),
reward_totals AS (
    SELECT
        app_user.id,
        app_user.telegram_id,
        COALESCE(approved_pullups.reps, 0) + COALESCE(approved_submissions.pullups, 0) AS pullups,
        COALESCE(approved_submissions.pushups, 0) AS pushups,
        COALESCE(approved_submissions.running_km, 0) AS running_km,
        COALESCE(approved_submissions.plank_seconds, 0) AS plank_seconds,
        (
            (COALESCE(approved_pullups.reps, 0) + COALESCE(approved_submissions.pullups, 0)) +
            COALESCE(approved_submissions.pushups, 0) +
            (COALESCE(approved_submissions.running_km, 0) * 10) +
            FLOOR(COALESCE(approved_submissions.plank_seconds, 0) / 10)
        )::INTEGER AS calculated_tokens,
        (
            ((COALESCE(approved_pullups.reps, 0) + COALESCE(approved_submissions.pullups, 0)) * 2) +
            COALESCE(approved_submissions.pushups, 0) +
            (COALESCE(approved_submissions.running_km, 0) * 10) +
            FLOOR(COALESCE(approved_submissions.plank_seconds, 0) / 10)
        )::INTEGER AS calculated_xp
    FROM public.users AS app_user
    LEFT JOIN approved_pullups
      ON approved_pullups.internal_user_id = app_user.id
    LEFT JOIN approved_submissions
      ON approved_submissions.telegram_id = app_user.telegram_id
),
updated_users AS (
    UPDATE public.users AS app_user
    SET xp = GREATEST(
            COALESCE(app_user.xp, 0),
            reward_totals.calculated_xp,
            CASE
                WHEN reward_totals.calculated_xp = 0 AND COALESCE(app_user.tokens, 0) > 0
                    THEN COALESCE(app_user.tokens, 0) * 2
                ELSE 0
            END
        ),
        total_xp = GREATEST(
            COALESCE(app_user.total_xp, 0),
            reward_totals.calculated_xp,
            CASE
                WHEN reward_totals.calculated_xp = 0 AND COALESCE(app_user.tokens, 0) > 0
                    THEN COALESCE(app_user.tokens, 0) * 2
                ELSE 0
            END
        ),
        level = (GREATEST(
            COALESCE(app_user.total_xp, 0),
            COALESCE(app_user.xp, 0),
            reward_totals.calculated_xp,
            CASE
                WHEN reward_totals.calculated_xp = 0 AND COALESCE(app_user.tokens, 0) > 0
                    THEN COALESCE(app_user.tokens, 0) * 2
                ELSE 0
            END
        ) / 100) + 1
    FROM reward_totals
    WHERE app_user.id = reward_totals.id
    RETURNING app_user.id
)
SELECT COUNT(*) FROM updated_users;

WITH approved_pullups AS (
    SELECT
        pullup.user_id AS internal_user_id,
        COALESCE(SUM(COALESCE(pullup.count, 0)), 0)::INTEGER AS reps
    FROM public.pullups AS pullup
    WHERE pullup.status = 'approved'
    GROUP BY pullup.user_id
),
approved_submissions AS (
    SELECT
        submission.user_id AS telegram_id,
        COALESCE(SUM(CASE WHEN submission.type = 'pullups' THEN submission.value ELSE 0 END), 0)::INTEGER AS pullups,
        COALESCE(SUM(CASE WHEN submission.type = 'pushups' THEN submission.value ELSE 0 END), 0)::INTEGER AS pushups,
        COALESCE(SUM(CASE WHEN submission.type = 'running' THEN submission.value ELSE 0 END), 0)::INTEGER AS running_km,
        COALESCE(SUM(CASE WHEN submission.type = 'plank' THEN submission.value ELSE 0 END), 0)::INTEGER AS plank_seconds
    FROM public.submissions AS submission
    WHERE submission.status = 'approved'
    GROUP BY submission.user_id
),
activity_totals AS (
    SELECT app_user.telegram_id, 'pullups' AS slug,
           COALESCE(approved_pullups.reps, 0) + COALESCE(approved_submissions.pullups, 0) AS progress,
           ((COALESCE(approved_pullups.reps, 0) + COALESCE(approved_submissions.pullups, 0)) * 2) AS xp
    FROM public.users AS app_user
    LEFT JOIN approved_pullups ON approved_pullups.internal_user_id = app_user.id
    LEFT JOIN approved_submissions ON approved_submissions.telegram_id = app_user.telegram_id
    UNION ALL
    SELECT telegram_id, 'pushups', pushups, pushups FROM approved_submissions
    UNION ALL
    SELECT telegram_id, 'running', running_km, running_km * 10 FROM approved_submissions
    UNION ALL
    SELECT telegram_id, 'plank', plank_seconds, FLOOR(plank_seconds / 10)::INTEGER FROM approved_submissions
)
INSERT INTO public.user_challenges (
    user_id,
    challenge_id,
    progress,
    xp,
    level,
    completed,
    completed_at
)
SELECT
    activity_totals.telegram_id,
    challenge.id,
    GREATEST(activity_totals.progress, 0),
    GREATEST(activity_totals.xp, 0),
    (GREATEST(activity_totals.xp, 0) / 100) + 1,
    GREATEST(activity_totals.progress, 0) >= challenge.goal,
    CASE WHEN GREATEST(activity_totals.progress, 0) >= challenge.goal THEN NOW() ELSE NULL END
FROM activity_totals
JOIN public.challenges AS challenge
  ON challenge.slug = activity_totals.slug
WHERE activity_totals.progress > 0 OR activity_totals.xp > 0
ON CONFLICT (user_id, challenge_id) DO UPDATE
SET progress = GREATEST(public.user_challenges.progress, EXCLUDED.progress),
    xp = GREATEST(public.user_challenges.xp, EXCLUDED.xp),
    level = (GREATEST(public.user_challenges.xp, EXCLUDED.xp) / 100) + 1,
    completed = public.user_challenges.completed OR EXCLUDED.completed,
    completed_at = COALESCE(public.user_challenges.completed_at, EXCLUDED.completed_at);

WITH eligible AS (
    SELECT
        app_user.telegram_id,
        achievement.id AS achievement_id
    FROM public.users AS app_user
    CROSS JOIN public.achievements AS achievement
    LEFT JOIN public.user_challenges AS pullups
      ON pullups.user_id = app_user.telegram_id
     AND pullups.challenge_id = (SELECT id FROM public.challenges WHERE slug = 'pullups')
    LEFT JOIN public.user_challenges AS pushups
      ON pushups.user_id = app_user.telegram_id
     AND pushups.challenge_id = (SELECT id FROM public.challenges WHERE slug = 'pushups')
    LEFT JOIN public.user_challenges AS running
      ON running.user_id = app_user.telegram_id
     AND running.challenge_id = (SELECT id FROM public.challenges WHERE slug = 'running')
    LEFT JOIN public.user_challenges AS plank
      ON plank.user_id = app_user.telegram_id
     AND plank.challenge_id = (SELECT id FROM public.challenges WHERE slug = 'plank')
    WHERE achievement.is_active
      AND CASE achievement.requirement_type
            WHEN 'first_pullup_submission' THEN COALESCE(pullups.progress, 0) >= 1
            WHEN 'total_pullups' THEN COALESCE(pullups.progress, 0) >= achievement.requirement_value
            WHEN 'total_pushups' THEN COALESCE(pushups.progress, 0) >= achievement.requirement_value
            WHEN 'total_running_km' THEN COALESCE(running.progress, 0) >= achievement.requirement_value
            WHEN 'total_plank_seconds' THEN COALESCE(plank.progress, 0) >= achievement.requirement_value
            WHEN 'tokens' THEN COALESCE(app_user.tokens, 0) >= achievement.requirement_value
            WHEN 'level' THEN COALESCE(app_user.level, 1) >= achievement.requirement_value
            ELSE FALSE
          END
)
INSERT INTO public.user_achievements (user_id, achievement_id)
SELECT telegram_id, achievement_id
FROM eligible
ON CONFLICT (user_id, achievement_id) DO NOTHING;

UPDATE public.pullups
SET rewards_applied = TRUE
WHERE status = 'approved';

UPDATE public.submissions
SET rewards_applied = TRUE
WHERE status = 'approved';

INSERT INTO public.schema_migrations (version, name)
VALUES ('005', 'xp rewards and reward idempotency')
ON CONFLICT (version) DO NOTHING;

COMMIT;
