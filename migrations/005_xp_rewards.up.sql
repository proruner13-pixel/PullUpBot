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

INSERT INTO public.schema_migrations (version, name)
VALUES ('005', 'xp rewards and reward idempotency')
ON CONFLICT (version) DO NOTHING;

COMMIT;
