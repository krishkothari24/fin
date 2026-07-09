-- CreateTable
CREATE TABLE "manual_assets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "current_value" DECIMAL(20,4) NOT NULL,
    "currency" TEXT DEFAULT 'USD',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manual_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "manual_assets_user_id_idx" ON "manual_assets"("user_id");

-- AddForeignKey
ALTER TABLE "manual_assets" ADD CONSTRAINT "manual_assets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Phase 6 pattern (see …_phase6_rls): RLS as defense-in-depth for direct DB access.
-- manual_assets is directly user-scoped (user_id column). Guarded on BOTH the `auth`
-- schema and the `authenticated` role so it is a no-op on a plain Postgres / Prisma
-- shadow DB (which have neither).
ALTER TABLE "manual_assets" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT ON "manual_assets" TO authenticated;

    CREATE POLICY manual_assets_select_own ON "manual_assets"
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;
