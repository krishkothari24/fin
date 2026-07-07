-- Phase 6: Row-Level Security (defense-in-depth).
--
-- The API connects as the table OWNER (the Supabase pooler role) and enforces
-- per-user authorization in its service layer. An owner BYPASSES RLS (we do not
-- FORCE it), so these policies do not change how the app behaves. Their job is to
-- lock down any *direct* access through the Supabase `authenticated` / `anon`
-- roles (PostgREST, supabase-js): a signed-in user may read ONLY their own rows,
-- writes are impossible (no write grants), and secrets/system tables are invisible.
--
-- To also subject the API's own connection to RLS (true backstop against an authz
-- bug in a service), add `... FORCE ROW LEVEL SECURITY;` per table and have the
-- app `SET LOCAL app.user_id` per request — see docs/SECURITY.md.

-- 1) Enable RLS on every table. Portable; safe on any Postgres. With RLS enabled
--    and no policy, non-owner roles see nothing (deny by default).
ALTER TABLE "profiles"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plaid_items"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "accounts"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transactions"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "balance_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dashboard_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_events"    ENABLE ROW LEVEL SECURITY;

-- 2) Supabase grants + owner-scoped policies. Guarded on the `authenticated` role
--    so this migration also applies cleanly to a plain Postgres (local/CI) that
--    has neither that role nor auth.uid(). DDL runs only inside the IF branch.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    -- Read-only surface for signed-in users. plaid_items excludes the encrypted
    -- access token column so it is never exposed, even to its owner, via the API-
    -- bypassing direct path. No INSERT/UPDATE/DELETE grants: writes stay API-only.
    GRANT SELECT (id, user_id, plaid_item_id, institution_id, institution_name,
                  status, transactions_cursor, last_synced_at, created_at)
      ON "plaid_items" TO authenticated;
    GRANT SELECT ON "profiles", "accounts", "transactions",
                    "balance_snapshots", "dashboard_configs" TO authenticated;

    -- Each user sees only their own graph. auth.uid() = the JWT `sub` (Supabase).
    CREATE POLICY profiles_select_own ON "profiles"
      FOR SELECT TO authenticated USING (id = auth.uid());

    CREATE POLICY items_select_own ON "plaid_items"
      FOR SELECT TO authenticated USING (user_id = auth.uid());

    CREATE POLICY accounts_select_own ON "accounts"
      FOR SELECT TO authenticated
      USING (item_id IN (SELECT id FROM "plaid_items" WHERE user_id = auth.uid()));

    CREATE POLICY transactions_select_own ON "transactions"
      FOR SELECT TO authenticated
      USING (account_id IN (
        SELECT a.id FROM "accounts" a
        JOIN "plaid_items" i ON i.id = a.item_id
        WHERE i.user_id = auth.uid()));

    CREATE POLICY snapshots_select_own ON "balance_snapshots"
      FOR SELECT TO authenticated
      USING (account_id IN (
        SELECT a.id FROM "accounts" a
        JOIN "plaid_items" i ON i.id = a.item_id
        WHERE i.user_id = auth.uid()));

    CREATE POLICY dashboard_select_own ON "dashboard_configs"
      FOR SELECT TO authenticated USING (user_id = auth.uid());

    -- webhook_events: no grant, no policy -> invisible to authenticated/anon.
  END IF;
END $$;
