-- Ensure the shared challenge catalog exists in every deployed database.
-- This is intentionally idempotent and does not create user-specific rows.

BEGIN;

SELECT pg_advisory_xact_lock(hashtext('pullup_seed_global_challenges_v1'));

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
    ('plank', 'Планка', 'Удерживай планку указанное количество секунд', 'plank', 300, 100, TRUE),
    ('running', 'Бег', 'Пробеги указанное количество километров', 'running', 10, 100, TRUE)
ON CONFLICT (slug) DO UPDATE
SET title = EXCLUDED.title,
    description = EXCLUDED.description,
    type = EXCLUDED.type,
    goal = EXCLUDED.goal,
    reward_tokens = EXCLUDED.reward_tokens,
    is_active = EXCLUDED.is_active;

INSERT INTO public.schema_migrations (version, name)
VALUES ('008', 'seed global active challenges')
ON CONFLICT (version) DO NOTHING;

COMMIT;
