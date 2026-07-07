BEGIN;

SELECT pg_advisory_xact_lock(hashtext('pullup_schema_migrations'));

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.schema_migrations
        WHERE version = '003'
    ) THEN
        RAISE EXCEPTION 'Migration 003 must be applied before 004';
    END IF;
END
$$;

ALTER TABLE public.pullups
    ALTER COLUMN video_file_id DROP NOT NULL;

ALTER TABLE public.pullups
    ADD COLUMN IF NOT EXISTS file_path TEXT,
    ADD COLUMN IF NOT EXISTS file_url TEXT,
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'telegram';

UPDATE public.pullups
SET source = 'telegram'
WHERE source IS NULL;

CREATE INDEX IF NOT EXISTS idx_pullups_status_created_at
    ON public.pullups (status, created_at);

INSERT INTO public.schema_migrations (version, name)
VALUES ('004', 'webapp pullup uploads')
ON CONFLICT (version) DO NOTHING;

COMMIT;
