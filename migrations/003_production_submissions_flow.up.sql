BEGIN;

SELECT pg_advisory_xact_lock(hashtext('pullup_schema_migrations'));

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.schema_migrations
        WHERE version = '002'
    ) THEN
        RAISE EXCEPTION 'Migration 002 must be applied before 003';
    END IF;
END
$$;

ALTER TABLE public.submissions
    DROP CONSTRAINT IF EXISTS ck_submissions_type;

ALTER TABLE public.submissions
    ADD CONSTRAINT ck_submissions_type
    CHECK (type IN ('pullups', 'pushups', 'plank', 'running'))
    NOT VALID;

ALTER TABLE public.submissions
    VALIDATE CONSTRAINT ck_submissions_type;

CREATE UNIQUE INDEX IF NOT EXISTS uq_token_transactions_submission
    ON public.token_transactions (source_type, source_id)
    WHERE source_type = 'submission' AND source_id IS NOT NULL;

INSERT INTO public.schema_migrations (version, name)
VALUES ('003', 'production submissions constraints and idempotency')
ON CONFLICT (version) DO NOTHING;

COMMIT;
