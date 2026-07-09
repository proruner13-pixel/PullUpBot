BEGIN;

ALTER TABLE public.submissions
    ALTER COLUMN value TYPE NUMERIC(12, 3)
    USING value::NUMERIC(12, 3);

INSERT INTO public.schema_migrations (version, name)
VALUES ('007', 'submission decimal activity values')
ON CONFLICT (version) DO NOTHING;

COMMIT;
