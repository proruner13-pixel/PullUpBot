BEGIN;

SELECT pg_advisory_xact_lock(hashtext('pullup_schema_migrations'));

INSERT INTO public.challenges (
    slug,
    title,
    description,
    type,
    goal,
    reward_tokens,
    is_active
)
VALUES
    ('pullups', 'Подтягивания', 'Суммарный прогресс по подтягиваниям', 'pullups', 50, 0, TRUE),
    ('pushups', 'Отжимания', 'Суммарный прогресс по отжиманиям', 'pushups', 100, 0, TRUE),
    ('running', 'Бег', 'Суммарные километры бега', 'running', 10, 0, TRUE),
    ('plank', 'Планка', 'Суммарные секунды планки', 'plank', 300, 0, TRUE)
ON CONFLICT (slug) DO UPDATE
SET title = EXCLUDED.title,
    description = EXCLUDED.description,
    type = EXCLUDED.type,
    goal = EXCLUDED.goal,
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

INSERT INTO public.schema_migrations (version, name)
VALUES ('006', 'backfill challenges rating and achievements')
ON CONFLICT (version) DO NOTHING;

COMMIT;
