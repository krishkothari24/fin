# fin-dashboard

Multi-tenant personal **financial dashboard**. Users connect their bank / credit
(and later investment) accounts via **Plaid**, and see an aggregated view — net
worth, balances, transactions, spending by category, cash flow — choosing what to
show. No AI: all insight is deterministic aggregation over Plaid data.

Backend-first. UI comes later.

## Stack

- **TypeScript** monorepo (pnpm workspaces): `apps/api`, `packages/shared`.
- **NestJS** backend (one module per domain).
- **Prisma** + **Postgres** (Supabase).
- **Supabase Auth** (JWT) for users; Postgres **RLS** for tenant isolation.
- **Plaid** Node SDK — Link, `/transactions/sync`, webhooks.
- **pg-boss** (Postgres-backed) for sync jobs.

## Layout

```
apps/api          NestJS backend
  prisma/         schema + migrations
  src/config      env loading + validation
  src/health      liveness endpoint
  src/prisma      PrismaService
  src/auth        Supabase JWT guard
  src/crypto      AES-256-GCM for Plaid access tokens
packages/shared   shared TS types / DTOs
```

## Getting started

```bash
pnpm install
cp apps/api/.env.example apps/api/.env    # then fill in Supabase + Plaid keys
pnpm --filter @fin/api prisma:generate
pnpm api:build
pnpm api:dev                              # http://localhost:3000/api/health
```

See `apps/api/.env.example` for required keys. Secrets never go in git.
