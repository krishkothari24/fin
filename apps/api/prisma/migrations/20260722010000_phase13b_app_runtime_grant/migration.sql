-- Phase 13 follow-up: grant the migrating/owner role membership in app_runtime.
--
-- Unlike Supabase's own `authenticated`/`anon` roles (which the project owner
-- is pre-configured to have membership in), `app_runtime` was just created by
-- the previous migration, and Postgres requires the switching role to either
-- be a member of the target role or a superuser to `SET ROLE` to it — Supabase
-- project owners are not true superusers. Discovered live, running the new
-- app_runtime isolation E2E: `SET LOCAL ROLE app_runtime` failed with
-- "permission denied to set role" until this grant exists.
--
-- Grants membership to CURRENT_USER (whichever role applies this migration —
-- the owner) rather than a hardcoded name, since Supabase's pooler-visible
-- username (`postgres.<project-ref>`) is a routing convention, not
-- necessarily the literal Postgres role name.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    EXECUTE format('GRANT app_runtime TO %I', CURRENT_USER);
  END IF;
END $$;
