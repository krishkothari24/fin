-- CreateTable
CREATE TABLE "transaction_details" (
    "id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "note" TEXT,
    "category_override" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transaction_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_splits" (
    "id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "amount" DECIMAL(20,4) NOT NULL,
    "category_override" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transaction_splits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transaction_details_transaction_id_key" ON "transaction_details"("transaction_id");

-- CreateIndex
CREATE INDEX "transaction_splits_transaction_id_idx" ON "transaction_splits"("transaction_id");

-- AddForeignKey
ALTER TABLE "transaction_details" ADD CONSTRAINT "transaction_details_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Phase 6 pattern (see …_phase6_rls): RLS as defense-in-depth for direct DB access.
-- Both tables scope through transaction -> account -> plaid_item -> user, same as
-- "transactions" itself. Guarded on BOTH the `auth` schema and the `authenticated`
-- role so it is a no-op on a plain Postgres / Prisma shadow DB (which have neither).
ALTER TABLE "transaction_details" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transaction_splits"  ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT ON "transaction_details", "transaction_splits" TO authenticated;

    CREATE POLICY transaction_details_select_own ON "transaction_details"
      FOR SELECT TO authenticated
      USING (transaction_id IN (
        SELECT t.id FROM "transactions" t
        JOIN "accounts" a ON a.id = t.account_id
        JOIN "plaid_items" i ON i.id = a.item_id
        WHERE i.user_id = auth.uid()));

    CREATE POLICY transaction_splits_select_own ON "transaction_splits"
      FOR SELECT TO authenticated
      USING (transaction_id IN (
        SELECT t.id FROM "transactions" t
        JOIN "accounts" a ON a.id = t.account_id
        JOIN "plaid_items" i ON i.id = a.item_id
        WHERE i.user_id = auth.uid()));
  END IF;
END $$;
