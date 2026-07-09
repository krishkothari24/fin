-- CreateTable
CREATE TABLE "budgets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "monthly_limit" DECIMAL(20,4) NOT NULL,
    "currency" TEXT DEFAULT 'USD',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "budgets_user_id_category_key" ON "budgets"("user_id", "category");

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Phase 6 pattern (see …_phase6_rls): RLS as defense-in-depth for direct DB access.
-- budgets is directly user-scoped (user_id column). Guarded on BOTH the `auth`
-- schema and the `authenticated` role so it is a no-op on a plain Postgres / Prisma
-- shadow DB (which have neither).
ALTER TABLE "budgets" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT ON "budgets" TO authenticated;

    CREATE POLICY budgets_select_own ON "budgets"
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;
