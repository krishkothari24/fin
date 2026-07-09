-- CreateTable
CREATE TABLE "goals" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "target_amount" DECIMAL(20,4) NOT NULL,
    "target_date" DATE,
    "linked_account_id" UUID,
    "current_amount_override" DECIMAL(20,4),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "goals_user_id_idx" ON "goals"("user_id");

-- CreateIndex
CREATE INDEX "goals_linked_account_id_idx" ON "goals"("linked_account_id");

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_linked_account_id_fkey" FOREIGN KEY ("linked_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Phase 6 pattern (see …_phase6_rls): RLS as defense-in-depth for direct DB access.
-- goals is directly user-scoped (user_id column). Guarded on BOTH the `auth` schema
-- and the `authenticated` role so it is a no-op on a plain Postgres / Prisma shadow
-- DB (which have neither).
ALTER TABLE "goals" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT ON "goals" TO authenticated;

    CREATE POLICY goals_select_own ON "goals"
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;
