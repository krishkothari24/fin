-- CreateTable
CREATE TABLE "securities" (
    "id" UUID NOT NULL,
    "plaid_security_id" TEXT NOT NULL,
    "name" TEXT,
    "ticker_symbol" TEXT,
    "type" TEXT,
    "close_price" DECIMAL(20,6),
    "close_price_as_of" DATE,
    "currency" TEXT DEFAULT 'USD',
    "is_cash_equivalent" BOOLEAN NOT NULL DEFAULT false,
    "cusip" TEXT,
    "isin" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "securities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holdings" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "security_id" UUID NOT NULL,
    "quantity" DECIMAL(28,8) NOT NULL,
    "institution_price" DECIMAL(20,6),
    "institution_price_as_of" DATE,
    "institution_value" DECIMAL(20,4),
    "cost_basis" DECIMAL(20,4),
    "currency" TEXT DEFAULT 'USD',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "holdings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investment_transactions" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "security_id" UUID,
    "plaid_investment_transaction_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subtype" TEXT,
    "quantity" DECIMAL(28,8),
    "amount" DECIMAL(20,4) NOT NULL,
    "price" DECIMAL(20,6),
    "fees" DECIMAL(20,4),
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT DEFAULT 'USD',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "securities_plaid_security_id_key" ON "securities"("plaid_security_id");

-- CreateIndex
CREATE INDEX "holdings_account_id_idx" ON "holdings"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "holdings_account_id_security_id_key" ON "holdings"("account_id", "security_id");

-- CreateIndex
CREATE UNIQUE INDEX "investment_transactions_plaid_investment_transaction_id_key" ON "investment_transactions"("plaid_investment_transaction_id");

-- CreateIndex
CREATE INDEX "investment_transactions_account_id_date_idx" ON "investment_transactions"("account_id", "date");

-- AddForeignKey
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_security_id_fkey" FOREIGN KEY ("security_id") REFERENCES "securities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_transactions" ADD CONSTRAINT "investment_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_transactions" ADD CONSTRAINT "investment_transactions_security_id_fkey" FOREIGN KEY ("security_id") REFERENCES "securities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Phase 6 pattern (see …_phase6_rls): RLS as defense-in-depth for direct DB access.
-- holdings + investment_transactions are user-scoped (via account -> item -> user);
-- securities is public market data -> enabled with no grant/policy (invisible to
-- authenticated, like webhook_events). The API owner bypasses RLS, so the app is
-- unaffected. Guarded on BOTH the `auth` schema and the `authenticated` role so it
-- is a no-op on a plain Postgres / Prisma shadow DB (which have neither).
ALTER TABLE "securities"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "holdings"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "investment_transactions"  ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT ON "holdings", "investment_transactions" TO authenticated;

    CREATE POLICY holdings_select_own ON "holdings"
      FOR SELECT TO authenticated
      USING (account_id IN (
        SELECT a.id FROM "accounts" a
        JOIN "plaid_items" i ON i.id = a.item_id
        WHERE i.user_id = auth.uid()));

    CREATE POLICY invtxn_select_own ON "investment_transactions"
      FOR SELECT TO authenticated
      USING (account_id IN (
        SELECT a.id FROM "accounts" a
        JOIN "plaid_items" i ON i.id = a.item_id
        WHERE i.user_id = auth.uid()));
  END IF;
END $$;

