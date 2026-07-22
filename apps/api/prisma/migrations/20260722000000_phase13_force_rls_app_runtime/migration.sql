-- Phase 13: RLS as a real backstop against the API itself, not just direct DB access.
--
-- Every policy since Phase 6 protects only the Supabase `authenticated`/`anon`
-- roles — the API connects as the table OWNER, which bypasses RLS regardless of
-- policy. This migration adds a second role, `app_runtime`, that the API's
-- pooled connection (DATABASE_URL) will use instead of the owner once it is
-- cut over: a non-owner, non-superuser role subject to `FORCE ROW LEVEL
-- SECURITY`, scoped per-request via `current_setting('app.user_id', true)`
-- (a session GUC the app sets with `SET LOCAL` inside a transaction wrapping
-- each request — see PrismaService's request-scoping extension). If that GUC
-- is ever unset (a bug, a stray query outside the per-request transaction),
-- every comparison below evaluates against NULL and the policy denies by
-- default — this is the actual point of the change: a bug in service-layer
-- `userId` filtering no longer means a cross-user leak, because the database
-- itself refuses the row.
--
-- `DIRECT_URL` (migrations + pg-boss) is UNCHANGED — it keeps using the owner
-- role. pg-boss only touches its own `pgboss` schema, and migrations need
-- owner/DDL privileges regardless, so neither needs this treatment.
--
-- No password is set here on purpose — a role with LOGIN and no password
-- cannot authenticate at all, so this migration is safe to run before the
-- credential is provisioned. The password is set out-of-band with
-- `ALTER ROLE app_runtime WITH PASSWORD '...'` directly against the database
-- (never committed, never put in a migration file) as part of the deploy
-- cutover — see docs/SECURITY.md.
--
-- Guarded on `pg_namespace nspname = 'auth'` (see Gotcha 8 / phase9+ migrations)
-- so this is a no-op on a plain local/CI Postgres that has neither Supabase's
-- `auth` schema nor a reason to run this role split at all.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN

    -- 1) The role. LOGIN so the API can connect as it; deliberately NOT
    --    superuser/BYPASSRLS/owner, which is the entire mechanism this relies on.
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
      CREATE ROLE app_runtime WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    END IF;

    GRANT USAGE ON SCHEMA public TO app_runtime;

    -- 2) Full CRUD grant on every app table — broader than `authenticated`'s
    --    read-only grant, since this role IS the application, and including
    --    plaid_items' encrypted token column (authenticated's grant excludes
    --    it; app_runtime needs to read/write it to actually use Plaid).
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      "profiles", "plaid_items", "accounts", "transactions", "balance_snapshots",
      "dashboard_configs", "webhook_events", "securities", "holdings",
      "investment_transactions", "liabilities", "recurring_streams",
      "manual_assets", "budgets", "transaction_details", "transaction_splits",
      "goals"
      TO app_runtime;

    -- 3) FORCE RLS on every user-scoped table. This is the actual switch: with
    --    FORCE set, even though app_runtime holds table-level GRANTs above, row
    --    visibility/writability is additionally gated by the policies below.
    --    securities (public market data) and webhook_events (system audit log,
    --    not user-scoped) are deliberately excluded — see their permissive
    --    policies at the bottom instead.
    ALTER TABLE "profiles"               FORCE ROW LEVEL SECURITY;
    ALTER TABLE "plaid_items"            FORCE ROW LEVEL SECURITY;
    ALTER TABLE "accounts"               FORCE ROW LEVEL SECURITY;
    ALTER TABLE "transactions"           FORCE ROW LEVEL SECURITY;
    ALTER TABLE "balance_snapshots"      FORCE ROW LEVEL SECURITY;
    ALTER TABLE "dashboard_configs"      FORCE ROW LEVEL SECURITY;
    ALTER TABLE "holdings"               FORCE ROW LEVEL SECURITY;
    ALTER TABLE "investment_transactions" FORCE ROW LEVEL SECURITY;
    ALTER TABLE "liabilities"            FORCE ROW LEVEL SECURITY;
    ALTER TABLE "recurring_streams"      FORCE ROW LEVEL SECURITY;
    ALTER TABLE "manual_assets"          FORCE ROW LEVEL SECURITY;
    ALTER TABLE "budgets"                FORCE ROW LEVEL SECURITY;
    ALTER TABLE "transaction_details"    FORCE ROW LEVEL SECURITY;
    ALTER TABLE "transaction_splits"     FORCE ROW LEVEL SECURITY;
    ALTER TABLE "goals"                  FORCE ROW LEVEL SECURITY;

    -- 4) app_runtime policies. FOR ALL covers SELECT/INSERT/UPDATE/DELETE in one
    --    clause; USING gates reads + the pre-image of updates/deletes, WITH CHECK
    --    gates the post-image of inserts/updates. Same ownership-chain joins as
    --    the existing `authenticated` policies, just keyed on the session GUC
    --    instead of `auth.uid()`.
    CREATE POLICY app_runtime_all ON "profiles"
      FOR ALL TO app_runtime
      USING (id = current_setting('app.user_id', true)::uuid)
      WITH CHECK (id = current_setting('app.user_id', true)::uuid);

    CREATE POLICY app_runtime_all ON "plaid_items"
      FOR ALL TO app_runtime
      USING (user_id = current_setting('app.user_id', true)::uuid)
      WITH CHECK (user_id = current_setting('app.user_id', true)::uuid);

    CREATE POLICY app_runtime_all ON "accounts"
      FOR ALL TO app_runtime
      USING (item_id IN (
        SELECT id FROM "plaid_items" WHERE user_id = current_setting('app.user_id', true)::uuid))
      WITH CHECK (item_id IN (
        SELECT id FROM "plaid_items" WHERE user_id = current_setting('app.user_id', true)::uuid));

    CREATE POLICY app_runtime_all ON "transactions"
      FOR ALL TO app_runtime
      USING (account_id IN (
        SELECT a.id FROM "accounts" a
        JOIN "plaid_items" i ON i.id = a.item_id
        WHERE i.user_id = current_setting('app.user_id', true)::uuid))
      WITH CHECK (account_id IN (
        SELECT a.id FROM "accounts" a
        JOIN "plaid_items" i ON i.id = a.item_id
        WHERE i.user_id = current_setting('app.user_id', true)::uuid));

    CREATE POLICY app_runtime_all ON "balance_snapshots"
      FOR ALL TO app_runtime
      USING (account_id IN (
        SELECT a.id FROM "accounts" a
        JOIN "plaid_items" i ON i.id = a.item_id
        WHERE i.user_id = current_setting('app.user_id', true)::uuid))
      WITH CHECK (account_id IN (
        SELECT a.id FROM "accounts" a
        JOIN "plaid_items" i ON i.id = a.item_id
        WHERE i.user_id = current_setting('app.user_id', true)::uuid));

    CREATE POLICY app_runtime_all ON "dashboard_configs"
      FOR ALL TO app_runtime
      USING (user_id = current_setting('app.user_id', true)::uuid)
      WITH CHECK (user_id = current_setting('app.user_id', true)::uuid);

    CREATE POLICY app_runtime_all ON "holdings"
      FOR ALL TO app_runtime
      USING (account_id IN (
        SELECT a.id FROM "accounts" a
        JOIN "plaid_items" i ON i.id = a.item_id
        WHERE i.user_id = current_setting('app.user_id', true)::uuid))
      WITH CHECK (account_id IN (
        SELECT a.id FROM "accounts" a
        JOIN "plaid_items" i ON i.id = a.item_id
        WHERE i.user_id = current_setting('app.user_id', true)::uuid));

    CREATE POLICY app_runtime_all ON "investment_transactions"
      FOR ALL TO app_runtime
      USING (account_id IN (
        SELECT a.id FROM "accounts" a
        JOIN "plaid_items" i ON i.id = a.item_id
        WHERE i.user_id = current_setting('app.user_id', true)::uuid))
      WITH CHECK (account_id IN (
        SELECT a.id FROM "accounts" a
        JOIN "plaid_items" i ON i.id = a.item_id
        WHERE i.user_id = current_setting('app.user_id', true)::uuid));

    CREATE POLICY app_runtime_all ON "liabilities"
      FOR ALL TO app_runtime
      USING (account_id IN (
        SELECT a.id FROM "accounts" a
        JOIN "plaid_items" i ON i.id = a.item_id
        WHERE i.user_id = current_setting('app.user_id', true)::uuid))
      WITH CHECK (account_id IN (
        SELECT a.id FROM "accounts" a
        JOIN "plaid_items" i ON i.id = a.item_id
        WHERE i.user_id = current_setting('app.user_id', true)::uuid));

    CREATE POLICY app_runtime_all ON "recurring_streams"
      FOR ALL TO app_runtime
      USING (account_id IN (
        SELECT a.id FROM "accounts" a
        JOIN "plaid_items" i ON i.id = a.item_id
        WHERE i.user_id = current_setting('app.user_id', true)::uuid))
      WITH CHECK (account_id IN (
        SELECT a.id FROM "accounts" a
        JOIN "plaid_items" i ON i.id = a.item_id
        WHERE i.user_id = current_setting('app.user_id', true)::uuid));

    CREATE POLICY app_runtime_all ON "manual_assets"
      FOR ALL TO app_runtime
      USING (user_id = current_setting('app.user_id', true)::uuid)
      WITH CHECK (user_id = current_setting('app.user_id', true)::uuid);

    CREATE POLICY app_runtime_all ON "budgets"
      FOR ALL TO app_runtime
      USING (user_id = current_setting('app.user_id', true)::uuid)
      WITH CHECK (user_id = current_setting('app.user_id', true)::uuid);

    CREATE POLICY app_runtime_all ON "transaction_details"
      FOR ALL TO app_runtime
      USING (transaction_id IN (
        SELECT t.id FROM "transactions" t
        JOIN "accounts" a ON a.id = t.account_id
        JOIN "plaid_items" i ON i.id = a.item_id
        WHERE i.user_id = current_setting('app.user_id', true)::uuid))
      WITH CHECK (transaction_id IN (
        SELECT t.id FROM "transactions" t
        JOIN "accounts" a ON a.id = t.account_id
        JOIN "plaid_items" i ON i.id = a.item_id
        WHERE i.user_id = current_setting('app.user_id', true)::uuid));

    CREATE POLICY app_runtime_all ON "transaction_splits"
      FOR ALL TO app_runtime
      USING (transaction_id IN (
        SELECT t.id FROM "transactions" t
        JOIN "accounts" a ON a.id = t.account_id
        JOIN "plaid_items" i ON i.id = a.item_id
        WHERE i.user_id = current_setting('app.user_id', true)::uuid))
      WITH CHECK (transaction_id IN (
        SELECT t.id FROM "transactions" t
        JOIN "accounts" a ON a.id = t.account_id
        JOIN "plaid_items" i ON i.id = a.item_id
        WHERE i.user_id = current_setting('app.user_id', true)::uuid));

    CREATE POLICY app_runtime_all ON "goals"
      FOR ALL TO app_runtime
      USING (user_id = current_setting('app.user_id', true)::uuid)
      WITH CHECK (user_id = current_setting('app.user_id', true)::uuid);

    -- 5) Not user-scoped: securities (shared market data) and webhook_events
    --    (system audit log, no end-user read path) get unrestricted access for
    --    app_runtime rather than a per-user policy. Not FORCEd (nothing to force
    --    against — there's no owner-vs-non-owner distinction to make here), but
    --    RLS is already ENABLEd on both since Phase 6/7, so app_runtime — being a
    --    non-owner role — needs an explicit permissive policy or it would see
    --    nothing on either table.
    CREATE POLICY app_runtime_all ON "securities"
      FOR ALL TO app_runtime USING (true) WITH CHECK (true);

    CREATE POLICY app_runtime_all ON "webhook_events"
      FOR ALL TO app_runtime USING (true) WITH CHECK (true);

  END IF;
END $$;
