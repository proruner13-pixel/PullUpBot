BEGIN;

SELECT pg_advisory_xact_lock(hashtext('pullup_schema_migrations'));

DROP TRIGGER IF EXISTS trg_pullups_sync_challenge ON public.pullups;
DROP TRIGGER IF EXISTS trg_users_create_default_challenges ON public.users;
DROP TRIGGER IF EXISTS trg_challenges_updated_at ON public.challenges;

DROP FUNCTION IF EXISTS public.sync_pullup_challenge();
DROP FUNCTION IF EXISTS public.refresh_pullup_challenge(INTEGER);
DROP FUNCTION IF EXISTS public.create_default_challenges();
DROP FUNCTION IF EXISTS public.set_challenge_updated_at();

DROP TABLE IF EXISTS public.challenges;

DELETE FROM public.schema_migrations
WHERE version = '001';

COMMIT;
