-- PULLUP base catalog and clean demo account.
-- Run only after sql/schema.sql.

BEGIN;

SELECT pg_advisory_xact_lock(hashtext('pullup_seed_v2'));

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
    ('pullups', 'Подтягивания', 'Выполни цель по подтягиваниям', 'pullups', 50, 100, TRUE),
    ('pushups', 'Отжимания', 'Выполни цель по отжиманиям', 'pushups', 150, 100, TRUE),
    ('plank', 'Планка', 'Удерживай планку указанное количество минут', 'plank', 5, 100, TRUE),
    ('running', 'Бег', 'Пробеги указанное количество километров', 'running', 10, 100, TRUE)
ON CONFLICT (slug) DO UPDATE
SET title = EXCLUDED.title,
    description = EXCLUDED.description,
    type = EXCLUDED.type,
    goal = EXCLUDED.goal,
    reward_tokens = EXCLUDED.reward_tokens,
    is_active = EXCLUDED.is_active;

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
    ('first_result', 'Первый шаг', 'Добавить первый результат', 'general', '🎬', 'result_count', 1, 0, TRUE),
    ('pullups_30', 'Турник-машина', 'Сделать 30 подтягиваний за раз', 'pullups', '💪', 'best_pullups', 30, 0, TRUE),
    ('pushups_100', 'Сотка', 'Сделать 100 отжиманий за раз', 'pushups', '🔥', 'best_pushups', 100, 0, TRUE),
    ('plank_5', 'Стальная планка', 'Простоять в планке 5 минут', 'plank', '🧱', 'best_plank', 5, 0, TRUE),
    ('run_5k', '5K Runner', 'Пробежать 5 километров', 'running', '🏃', 'best_running', 5, 0, TRUE),
    ('run_10k', '10K Beast', 'Пробежать 10 километров', 'running', '⚡', 'best_running', 10, 0, TRUE),
    ('level_10', 'Не новичок', 'Получить общий уровень 10', 'level', '🏅', 'level', 10, 0, TRUE),
    ('token_1000', 'Копилка', 'Накопить 1000 PULLUP', 'tokens', '💰', 'tokens', 1000, 0, TRUE),
    ('all_sports', 'Мультиспортсмен', 'Получить результат во всех видах спорта', 'general', '🌍', 'sport_count', 4, 0, TRUE),
    ('champion', 'Чемпион', 'Получить общий уровень 20', 'level', '👑', 'level', 20, 0, TRUE)
ON CONFLICT (slug) DO UPDATE
SET title = EXCLUDED.title,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    icon = EXCLUDED.icon,
    requirement_type = EXCLUDED.requirement_type,
    requirement_value = EXCLUDED.requirement_value,
    reward_tokens = EXCLUDED.reward_tokens,
    is_active = EXCLUDED.is_active;

-- Preserve and migrate progress from migration 001 if that table was renamed.
DO $$
BEGIN
    IF to_regclass('public.legacy_user_challenges') IS NOT NULL THEN
        INSERT INTO public.user_challenges (
            user_id,
            challenge_id,
            progress,
            completed,
            completed_at,
            created_at
        )
        SELECT
            app_user.telegram_id,
            challenge.id,
            legacy.progress,
            legacy.progress >= legacy.goal,
            CASE
                WHEN legacy.progress >= legacy.goal THEN NOW()
                ELSE NULL
            END,
            legacy.created_at
        FROM public.legacy_user_challenges AS legacy
        JOIN public.users AS app_user
          ON app_user.id = legacy.user_id
        JOIN public.challenges AS challenge
          ON challenge.slug = legacy.exercise
        ON CONFLICT (user_id, challenge_id) DO UPDATE
        SET progress = GREATEST(
                public.user_challenges.progress,
                EXCLUDED.progress
            ),
            completed = (
                public.user_challenges.completed OR EXCLUDED.completed
            ),
            completed_at = COALESCE(
                public.user_challenges.completed_at,
                EXCLUDED.completed_at
            );
    END IF;
END
$$;

INSERT INTO public.users (
    telegram_id,
    username,
    display_name,
    first_name,
    last_name,
    avatar_url,
    tokens,
    level,
    streak_days,
    ref_code,
    referrals_count
)
VALUES (
    123456789,
    'demo_user',
    'Athlete',
    'Athlete',
    NULL,
    NULL,
    0,
    1,
    0,
    'PULLUP-DEMO-123',
    0
)
ON CONFLICT (telegram_id) DO UPDATE
SET username = EXCLUDED.username,
    display_name = EXCLUDED.display_name,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    avatar_url = EXCLUDED.avatar_url,
    tokens = 0,
    level = 1,
    streak_days = 0,
    referred_by = NULL,
    referrals_count = 0,
    updated_at = NOW();

-- Clear only the dedicated demo account. Real users are untouched.
DELETE FROM public.user_achievements
WHERE user_id = 123456789;

DELETE FROM public.token_transactions
WHERE user_id = 123456789;

DELETE FROM public.submissions
WHERE user_id = 123456789;

DELETE FROM public.referrals
WHERE referrer_id = 123456789
   OR invited_user_id = 123456789;

DELETE FROM public.pullups
WHERE user_id = (
    SELECT id
    FROM public.users
    WHERE telegram_id = 123456789
);

DELETE FROM public.user_challenges
WHERE user_id = 123456789;

INSERT INTO public.user_challenges (
    user_id,
    challenge_id,
    progress,
    completed,
    completed_at
)
SELECT
    123456789,
    challenge.id,
    0,
    FALSE,
    NULL
FROM public.challenges AS challenge
WHERE challenge.is_active
ON CONFLICT (user_id, challenge_id) DO UPDATE
SET progress = 0,
    completed = FALSE,
    completed_at = NULL;

COMMIT;
