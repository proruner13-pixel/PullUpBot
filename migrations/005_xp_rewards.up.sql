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

INSERT INTO public.schema_migrations (version, name)
VALUES ('005', 'xp rewards and reward idempotency')
ON CONFLICT (version) DO NOTHING;

COMMIT;
