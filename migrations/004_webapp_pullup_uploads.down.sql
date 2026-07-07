BEGIN;

SELECT pg_advisory_xact_lock(hashtext('pullup_schema_migrations'));

DROP INDEX IF EXISTS public.idx_pullups_status_created_at;

ALTER TABLE public.pullups
    DROP COLUMN IF EXISTS source,
    DROP COLUMN IF EXISTS file_url,
    DROP COLUMN IF EXISTS file_path;

DELETE FROM public.schema_migrations
WHERE version = '004';

COMMIT;
