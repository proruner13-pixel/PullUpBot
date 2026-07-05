BEGIN;

SELECT pg_advisory_xact_lock(hashtext('pullup_schema_migrations'));

CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Minimal legacy foundation. Migration 002 extends these tables without
-- deleting existing rows and keeps them compatible with the current bot.
CREATE TABLE IF NOT EXISTS public.users (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,
    username TEXT,
    display_name TEXT,
    tokens INTEGER NOT NULL DEFAULT 0,
    weekly_goal INTEGER NOT NULL DEFAULT 0,
    ref_code TEXT UNIQUE,
    referred_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
    referrals_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.pullups (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL
        REFERENCES public.users(id) ON DELETE CASCADE,
    video_file_id TEXT NOT NULL,
    caption TEXT,
    count INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    moderator_id BIGINT,
    reject_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    moderated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_telegram_id
    ON public.users (telegram_id);
CREATE INDEX IF NOT EXISTS idx_pullups_status
    ON public.pullups (status);

DO $$
BEGIN
    IF to_regclass('public.users') IS NULL THEN
        RAISE EXCEPTION 'Required table public.users does not exist';
    END IF;

    IF to_regclass('public.pullups') IS NULL THEN
        RAISE EXCEPTION 'Required table public.pullups does not exist';
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.challenges (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL
        REFERENCES public.users(id) ON DELETE CASCADE,
    exercise TEXT NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0,
    goal INTEGER NOT NULL,
    level INTEGER NOT NULL DEFAULT 1,
    unit TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_challenges_user_exercise
        UNIQUE (user_id, exercise),

    CONSTRAINT ck_challenges_exercise
        CHECK (exercise IN ('pullups', 'pushups', 'plank', 'running')),

    CONSTRAINT ck_challenges_progress
        CHECK (progress >= 0),

    CONSTRAINT ck_challenges_goal
        CHECK (goal > 0),

    CONSTRAINT ck_challenges_level
        CHECK (level >= 1),

    CONSTRAINT ck_challenges_unit
        CHECK (unit IN ('repetitions', 'minutes', 'kilometers'))
);

INSERT INTO public.challenges (user_id, exercise, goal, unit)
SELECT
    users.id,
    defaults.exercise,
    defaults.goal,
    defaults.unit
FROM public.users
CROSS JOIN (
    VALUES
        ('pullups', 50, 'repetitions'),
        ('pushups', 150, 'repetitions'),
        ('plank', 5, 'minutes'),
        ('running', 10, 'kilometers')
) AS defaults(exercise, goal, unit)
ON CONFLICT (user_id, exercise) DO NOTHING;

WITH pullup_totals AS (
    SELECT
        user_id,
        COALESCE(SUM(count), 0)::INTEGER AS progress
    FROM public.pullups
    WHERE status = 'approved'
    GROUP BY user_id
)
UPDATE public.challenges AS challenge
SET
    progress = totals.progress,
    updated_at = NOW()
FROM pullup_totals AS totals
WHERE challenge.user_id = totals.user_id
  AND challenge.exercise = 'pullups';

CREATE OR REPLACE FUNCTION public.set_challenge_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_challenges_updated_at ON public.challenges;
CREATE TRIGGER trg_challenges_updated_at
BEFORE UPDATE ON public.challenges
FOR EACH ROW
EXECUTE FUNCTION public.set_challenge_updated_at();

CREATE OR REPLACE FUNCTION public.create_default_challenges()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO public.challenges (user_id, exercise, goal, unit)
    VALUES
        (NEW.id, 'pullups', 50, 'repetitions'),
        (NEW.id, 'pushups', 150, 'repetitions'),
        (NEW.id, 'plank', 5, 'minutes'),
        (NEW.id, 'running', 10, 'kilometers')
    ON CONFLICT (user_id, exercise) DO NOTHING;

    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_users_create_default_challenges ON public.users;
CREATE TRIGGER trg_users_create_default_challenges
AFTER INSERT ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.create_default_challenges();

CREATE OR REPLACE FUNCTION public.refresh_pullup_challenge(p_user_id INTEGER)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO public.challenges (
        user_id,
        exercise,
        progress,
        goal,
        level,
        unit
    )
    SELECT
        users.id,
        'pullups',
        COALESCE((
            SELECT SUM(COALESCE(pullups.count, 0))
            FROM public.pullups
            WHERE pullups.user_id = users.id
              AND pullups.status = 'approved'
        ), 0)::INTEGER,
        50,
        1,
        'repetitions'
    FROM public.users
    WHERE users.id = p_user_id
    ON CONFLICT (user_id, exercise) DO UPDATE
    SET progress = EXCLUDED.progress;
END
$$;

CREATE OR REPLACE FUNCTION public.sync_pullup_challenge()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM public.refresh_pullup_challenge(OLD.user_id);
        RETURN OLD;
    END IF;

    IF TG_OP = 'INSERT' THEN
        PERFORM public.refresh_pullup_challenge(NEW.user_id);
        RETURN NEW;
    END IF;

    PERFORM public.refresh_pullup_challenge(OLD.user_id);

    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
        PERFORM public.refresh_pullup_challenge(NEW.user_id);
    END IF;

    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_pullups_sync_challenge ON public.pullups;
CREATE TRIGGER trg_pullups_sync_challenge
AFTER INSERT OR UPDATE OR DELETE ON public.pullups
FOR EACH ROW
EXECUTE FUNCTION public.sync_pullup_challenge();

INSERT INTO public.schema_migrations (version, name)
VALUES ('001', 'create challenges and synchronize pullups')
ON CONFLICT (version) DO NOTHING;

COMMIT;
