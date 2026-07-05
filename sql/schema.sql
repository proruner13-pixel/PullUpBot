-- PULLUP PostgreSQL bootstrap snapshot (equivalent to migration 002).
-- Numbered files in migrations/ are the source of truth.
-- After this snapshot, run `python -m app.migrate up` for later migrations.
-- Safe to run from pgAdmin Query Tool.
-- This script never drops public.users or public.pullups.

BEGIN;

SELECT pg_advisory_xact_lock(hashtext('pullup_schema_v2'));

CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Keep the legacy surrogate id because the current bot and pullups.user_id use it.
-- telegram_id is the canonical public user identifier and remains UNIQUE NOT NULL.
CREATE TABLE IF NOT EXISTS public.users (
    id BIGSERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,
    username TEXT,
    display_name TEXT,
    first_name TEXT,
    last_name TEXT,
    avatar_url TEXT,
    tokens INTEGER NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 1,
    weekly_goal INTEGER NOT NULL DEFAULT 0,
    streak_days INTEGER NOT NULL DEFAULT 0,
    ref_code TEXT UNIQUE,
    referred_by BIGINT NULL REFERENCES public.users(id) ON DELETE SET NULL,
    referrals_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS id BIGSERIAL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS weekly_goal INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS streak_days INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS ref_code TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS referred_by BIGINT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS referrals_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_telegram_id
    ON public.users (telegram_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_internal_id
    ON public.users (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_ref_code
    ON public.users (ref_code)
    WHERE ref_code IS NOT NULL;

-- Preserve the table used by the existing Telegram bot.
CREATE TABLE IF NOT EXISTS public.pullups (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    video_file_id TEXT NOT NULL,
    caption TEXT,
    count INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    moderator_id BIGINT,
    reject_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    moderated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pullups_status
    ON public.pullups (status);
CREATE INDEX IF NOT EXISTS idx_pullups_user_id
    ON public.pullups (user_id);

-- Migration 001 used public.challenges for per-user progress.
-- Preserve it under a descriptive backup name before creating the catalog.
DO $$
BEGIN
    IF to_regclass('public.challenges') IS NOT NULL
       AND EXISTS (
           SELECT 1
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'challenges'
             AND column_name = 'user_id'
       )
       AND NOT EXISTS (
           SELECT 1
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'challenges'
             AND column_name = 'slug'
       )
    THEN
        IF to_regclass('public.legacy_user_challenges') IS NOT NULL THEN
            RAISE EXCEPTION
                'Both challenges and legacy_user_challenges exist. Resolve manually before continuing.';
        END IF;
        ALTER TABLE public.challenges RENAME TO legacy_user_challenges;
    END IF;
END
$$;

-- Replace only obsolete synchronization objects from migration 001.
DROP TRIGGER IF EXISTS trg_users_create_default_challenges ON public.users;
DROP TRIGGER IF EXISTS trg_pullups_sync_challenge ON public.pullups;
DO $$
BEGIN
    IF to_regclass('public.legacy_user_challenges') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS trg_challenges_updated_at
            ON public.legacy_user_challenges;
    END IF;
END
$$;
DROP FUNCTION IF EXISTS public.create_default_challenges();
DROP FUNCTION IF EXISTS public.sync_pullup_challenge();
DROP FUNCTION IF EXISTS public.set_challenge_updated_at();

CREATE TABLE IF NOT EXISTS public.challenges (
    id SERIAL PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL,
    goal INTEGER NOT NULL CHECK (goal > 0),
    reward_tokens INTEGER NOT NULL DEFAULT 0 CHECK (reward_tokens >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.submissions (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL
        REFERENCES public.users(telegram_id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    value INTEGER NOT NULL DEFAULT 0 CHECK (value >= 0),
    video_file_id TEXT,
    video_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
    moderator_comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_submissions_user_id
    ON public.submissions (user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status_created_at
    ON public.submissions (status, created_at);

CREATE TABLE IF NOT EXISTS public.user_challenges (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL
        REFERENCES public.users(telegram_id) ON DELETE CASCADE,
    challenge_id INTEGER NOT NULL
        REFERENCES public.challenges(id) ON DELETE CASCADE,
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0),
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, challenge_id)
);

CREATE INDEX IF NOT EXISTS idx_user_challenges_user_id
    ON public.user_challenges (user_id);

CREATE TABLE IF NOT EXISTS public.achievements (
    id SERIAL PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT,
    icon TEXT,
    requirement_type TEXT,
    requirement_value INTEGER NOT NULL DEFAULT 0,
    reward_tokens INTEGER NOT NULL DEFAULT 0 CHECK (reward_tokens >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_achievements (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL
        REFERENCES public.users(telegram_id) ON DELETE CASCADE,
    achievement_id INTEGER NOT NULL
        REFERENCES public.achievements(id) ON DELETE CASCADE,
    unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    animation_seen BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id
    ON public.user_achievements (user_id);

CREATE TABLE IF NOT EXISTS public.token_transactions (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL
        REFERENCES public.users(telegram_id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    reason TEXT NOT NULL,
    source_type TEXT,
    source_id INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_transactions_user_created_at
    ON public.token_transactions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.referrals (
    id SERIAL PRIMARY KEY,
    referrer_id BIGINT NOT NULL
        REFERENCES public.users(telegram_id) ON DELETE CASCADE,
    invited_user_id BIGINT NOT NULL
        REFERENCES public.users(telegram_id) ON DELETE CASCADE,
    reward_tokens INTEGER NOT NULL DEFAULT 0 CHECK (reward_tokens >= 0),
    rewarded BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (referrer_id, invited_user_id),
    CHECK (referrer_id <> invited_user_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_invited_user_id
    ON public.referrals (invited_user_id);

CREATE OR REPLACE FUNCTION public.pullup_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.pullup_set_updated_at();

CREATE OR REPLACE FUNCTION public.create_user_challenges()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO public.user_challenges (user_id, challenge_id)
    SELECT NEW.telegram_id, challenge.id
    FROM public.challenges AS challenge
    WHERE challenge.is_active
    ON CONFLICT (user_id, challenge_id) DO NOTHING;
    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_users_create_user_challenges ON public.users;
CREATE TRIGGER trg_users_create_user_challenges
AFTER INSERT ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.create_user_challenges();

-- Keep legacy bot moderation visible in the new shared progress table.
CREATE OR REPLACE FUNCTION public.sync_pullup_user_challenge()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    internal_user_id BIGINT;
    telegram_user_id BIGINT;
    pullup_challenge_id INTEGER;
    approved_total INTEGER;
    challenge_goal INTEGER;
BEGIN
    internal_user_id := CASE
        WHEN TG_OP = 'DELETE' THEN OLD.user_id
        ELSE NEW.user_id
    END;

    SELECT telegram_id
    INTO telegram_user_id
    FROM public.users
    WHERE id = internal_user_id;

    SELECT id, goal
    INTO pullup_challenge_id, challenge_goal
    FROM public.challenges
    WHERE slug = 'pullups';

    IF telegram_user_id IS NOT NULL AND pullup_challenge_id IS NOT NULL THEN
        SELECT COALESCE(SUM(COALESCE(count, 0)), 0)::INTEGER
        INTO approved_total
        FROM public.pullups
        WHERE user_id = internal_user_id
          AND status = 'approved';

        INSERT INTO public.user_challenges (
            user_id,
            challenge_id,
            progress,
            completed,
            completed_at
        )
        VALUES (
            telegram_user_id,
            pullup_challenge_id,
            approved_total,
            approved_total >= challenge_goal,
            CASE WHEN approved_total >= challenge_goal THEN NOW() ELSE NULL END
        )
        ON CONFLICT (user_id, challenge_id) DO UPDATE
        SET progress = EXCLUDED.progress,
            completed = EXCLUDED.completed,
            completed_at = CASE
                WHEN EXCLUDED.completed
                    THEN COALESCE(
                        public.user_challenges.completed_at,
                        EXCLUDED.completed_at
                    )
                ELSE NULL
            END;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_pullups_sync_user_challenge ON public.pullups;
CREATE TRIGGER trg_pullups_sync_user_challenge
AFTER INSERT OR UPDATE OR DELETE ON public.pullups
FOR EACH ROW
EXECUTE FUNCTION public.sync_pullup_user_challenge();

INSERT INTO public.schema_migrations (version, name)
VALUES ('002', 'shared product schema with telegram_id relations')
ON CONFLICT (version) DO NOTHING;

COMMIT;
