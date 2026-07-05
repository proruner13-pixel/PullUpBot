BEGIN;

SELECT pg_advisory_xact_lock(hashtext('pullup_schema_migrations'));

DROP INDEX IF EXISTS public.uq_token_transactions_submission;

ALTER TABLE public.submissions
    DROP CONSTRAINT IF EXISTS ck_submissions_type;

DELETE FROM public.schema_migrations
WHERE version = '003';

COMMIT;
