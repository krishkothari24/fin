-- CreateTable
CREATE TABLE "liabilities" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "apr_percentage" DECIMAL(10,4),
    "last_payment_amount" DECIMAL(20,4),
    "last_payment_date" DATE,
    "last_statement_balance" DECIMAL(20,4),
    "last_statement_issue_date" DATE,
    "minimum_payment_amount" DECIMAL(20,4),
    "next_payment_due_date" DATE,
    "is_overdue" BOOLEAN,
    "details" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "liabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_streams" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "plaid_stream_id" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "merchant_name" TEXT,
    "category" TEXT,
    "frequency" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL,
    "first_date" DATE NOT NULL,
    "last_date" DATE NOT NULL,
    "predicted_next_date" DATE,
    "average_amount" DECIMAL(20,4),
    "last_amount" DECIMAL(20,4),
    "currency" TEXT DEFAULT 'USD',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_streams_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "liabilities_account_id_key" ON "liabilities"("account_id");

-- CreateIndex
CREATE INDEX "liabilities_account_id_idx" ON "liabilities"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_streams_plaid_stream_id_key" ON "recurring_streams"("plaid_stream_id");

-- CreateIndex
CREATE INDEX "recurring_streams_account_id_idx" ON "recurring_streams"("account_id");

-- AddForeignKey
ALTER TABLE "liabilities" ADD CONSTRAINT "liabilities_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_streams" ADD CONSTRAINT "recurring_streams_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Phase 6 pattern (see …_phase6_rls): RLS as defense-in-depth for direct DB access.
-- liabilities + recurring_streams are user-scoped (via account -> item -> user).
-- The API owner bypasses RLS, so the app is unaffected. Guarded on BOTH the `auth`
-- schema and the `authenticated` role so it is a no-op on a plain Postgres / Prisma
-- shadow DB (which have neither).
ALTER TABLE "liabilities"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recurring_streams"  ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT ON "liabilities", "recurring_streams" TO authenticated;

    CREATE POLICY liabilities_select_own ON "liabilities"
      FOR SELECT TO authenticated
      USING (account_id IN (
        SELECT a.id FROM "accounts" a
        JOIN "plaid_items" i ON i.id = a.item_id
        WHERE i.user_id = auth.uid()));

    CREATE POLICY recurring_select_own ON "recurring_streams"
      FOR SELECT TO authenticated
      USING (account_id IN (
        SELECT a.id FROM "accounts" a
        JOIN "plaid_items" i ON i.id = a.item_id
        WHERE i.user_id = auth.uid()));
  END IF;
END $$;
