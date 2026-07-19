# CLAUDE.md

Guidance for Claude Code working in this repo. Keep it short; deep detail lives in
[docs/STATE.md](docs/STATE.md) (ground-truth of what exists and why) and
[docs/SECURITY.md](docs/SECURITY.md) (threat model + go-live checklist).

## What this is

A **multi-tenant, read-only financial dashboard SaaS**. Users connect bank / credit /
investment accounts via **Plaid** and see aggregated net worth, balances, transactions,
spending, cash flow, holdings, liabilities, recurring streams, budgets, and goals — plus
manually-tracked, off-platform assets/liabilities for anything Plaid can't see. Both
`apps/api` (NestJS) and `apps/web` (Vite + React) are real and live; backend logic is
verified with live Plaid Sandbox E2E scripts, frontend flows with Playwright against a real
Supabase-authenticated session (see Gotcha 9).

Hard product constraints (they shape every decision):
- **Read-only.** No trade execution, no moving money.
- **No AI / no ML.** All "intelligence" is deterministic aggregation. Plaid returns
  categories, account types, and recurring streams — never add a model to categorize.
- **Multi-tenant.** Every row belongs to a user; user A must never see user B's data.

Phases 1–12 are complete. See STATE.md §2 (phases 1–8) and §22–25 (phases 9–12: manual
assets/liabilities, budgets, transaction notes/tags/splits, goals).

## Layout

pnpm workspace monorepo. `apps/api` (`@fin/api`) and `apps/web` (`@fin/web`) both depend on
`packages/shared` (`@fin/shared`, the API-contract types) via `workspace:*`.

- `apps/api/src/<domain>/` — one NestJS module per domain (controller + service + mappers/DTOs).
  Modules: `plaid items sync accounts transactions aggregations dashboard investments
  liabilities recurring manual-assets budgets goals` plus infra (`config crypto auth prisma
  health observability`).
- See `apps/web/CLAUDE.md` for frontend-specific conventions (new pages, dashboard widgets, forms).

## Commands (run from repo root)

```bash
pnpm api:build        # builds @fin/shared FIRST, then @fin/api  (always use this order)
pnpm api:dev          # watch mode → http://localhost:3000/api/health
pnpm --filter @fin/web dev               # Vite dev server → http://localhost:5173
pnpm --filter @fin/api test              # Jest unit tests (mappers + DTOs)
pnpm --filter @fin/api prisma:generate   # regen client after schema edit (no DB)
pnpm --filter @fin/api prisma:migrate    # create + apply a migration (touches DB)
pnpm --filter @fin/api prisma:deploy     # apply existing migrations (prod/deploy) — also the
                                          # workaround for Gotcha 8 (shadow-DB migrate dev bug)
pnpm --filter @fin/api e2e:<phase>       # sandbox|sync|read|dashboard|rls|hardening|investments
                                          # |liabilities-recurring|manual-assets|budgets
                                          # |transaction-details|goals
```

## Gotchas that will bite you (read before touching DB / Plaid / types)

1. **Sandbox blocks Prisma/Plaid subprocesses.** Any command that touches the DB or calls
   Plaid must run with `dangerouslyDisableSandbox: true`. If you see Prisma `P1001`
   ("can't reach database") but `psql`/`nc` to the same host works, it's the dev-shell
   sandbox silencing Prisma's spawned query engine — **not** a real DB/`.env` problem. (STATE.md §8)

2. **Rebuild `@fin/shared` before `@fin/api` sees new types.** Shared compiles to `dist/`
   and is consumed via the workspace symlink. After editing `packages/shared`, run
   `pnpm api:build` (it builds shared first). Editing shared without rebuilding = stale types.

3. **Money is `DECIMAL(20,4)`, never float; it crosses the wire as `string`.** Every money
   field in the DTOs is `string`. Do math in `Prisma.Decimal`, never `parseFloat`.

4. **Plaid sign convention: positive = money OUT of the account.** `amount > 0` is spending,
   `< 0` is income. For recurring streams we store **positive magnitudes** and let
   `direction` (inflow/outflow) carry the sign (Plaid signs inflows negative). Get this
   backwards and every number inverts — the E2Es assert it.

5. **Two DB URLs.** `DATABASE_URL` = Supabase pooler (:6543) for app queries;
   `DIRECT_URL` = direct (:5432) for migrations **and pg-boss** (needs session features).
   Get both from Supabase → Connect → ORM → Prisma. (STATE.md §7.5)

6. **Prisma pinned to v6.** v7 drops `url = env(...)` and forces a driver-adapter setup.
   Keep `prisma` and `@prisma/client` on `^6` together — never bump one without the other.

7. **First runtime (non-type) import of a new `@fin/shared` export into `apps/web`?
   Check it actually resolves.** `@fin/shared` is a workspace-linked CJS build (`tsc`, not
   bundled). Vite serves linked packages' source as-is over `/@fs/` by default, skipping the
   CJS→ESM interop it normally does via esbuild's dependency pre-bundler — so a named *value*
   import (a runtime const, not an `interface`/`type`) can silently fail to resolve (blank
   page, `does not provide an export named 'X'`) even though `tsc` and `pnpm api:build` are
   completely green. Fixed once via `optimizeDeps.include: ["@fin/shared"]` in
   `apps/web/vite.config.ts` — if a *different* new export breaks the same way, something
   regressed that fix, not the export itself.

8. **`prisma migrate dev` fails on a fresh shadow DB with `schema "auth" does not exist`.**
   The original `phase6_rls` migration guards its `DO $$` block on `pg_roles rolname =
   'authenticated'` only — but on this Supabase project, Postgres roles are cluster-wide, so
   a freshly-created shadow DB *does* have the `authenticated` role even though it lacks the
   `auth` schema/`auth.uid()` function, and the guard passes when it shouldn't. Migrations
   from `phase8` onward guard on *both* `pg_namespace nspname = 'auth'` AND the role, which is
   the fix — but `phase6_rls` itself is already applied live and editing it now would create a
   checksum mismatch. **Don't run `prisma migrate dev`** (it replays the whole history through
   a shadow DB and hits this every time); hand-write the migration SQL and apply it with
   `prisma migrate deploy` instead (no shadow DB involved) — see any `phase9`+ migration folder
   for the exact guarded-RLS-block template to copy.

9. **Verifying an authenticated web flow?** The sign-up form's email validation rejects
   made-up domains (`@example.com`, `@krishtest.dev`, etc. all bounce with "email address is
   invalid") — don't burn time finding a domain that passes. Instead, mint a confirmed user
   directly via the Supabase Admin API (`POST {SUPABASE_URL}/auth/v1/admin/users` with
   `SUPABASE_SECRET_KEY`, `email_confirm: true`), exchange credentials for a session
   (`POST /auth/v1/token?grant_type=password` with `SUPABASE_PUBLISHABLE_KEY`), then inject
   that session into `localStorage` under `sb-<project-ref>-auth-token` (JSON-stringified)
   before navigating in Playwright. Delete the user via the same Admin API when done — it does
   **not** cascade-delete the app's `profiles` row, so purge that separately too
   (`prisma.profile.delete`, which cascades to everything else via FKs).

## Conventions

- **Every user route is behind `SupabaseJwtGuard`** and reads the user via `@CurrentUser()`;
  **every query is scoped by `userId`** in the service layer (layer-1 authz). Postgres RLS is
  defense-in-depth only — the API connects as owner and bypasses it. (SECURITY.md)
- **Aggregations exclude hidden accounts** (`Account.isHidden`). Note `isHidden` (a column,
  changes totals) is distinct from `DashboardConfig.hiddenAccountIds` (a visual preference only).
- **Plaid access tokens are AES-256-GCM encrypted at rest**, decrypted only in-method. Never
  log or return them.
- **Secrets live in gitignored `apps/api/.env`** (`.env.example` documents keys). Never commit
  or paste secrets. Rotating/losing `ENCRYPTION_KEY` makes every stored token undecryptable.
- **Sync patterns:** snapshot data (holdings, liabilities, recurring streams) is **replaced
  wholesale** (`deleteMany`+`createMany` in one `$transaction`); append data (transactions,
  investment txns) is **upserted on the Plaid id** (idempotent). Each product has its own
  pg-boss queue, enqueued on connect and on the relevant webhook. Best-effort: skippable Plaid
  codes (`PRODUCT_NOT_READY`, `NO_*_ACCOUNTS`, `PRODUCTS_NOT_SUPPORTED`) are caught, not failed.
- **New read endpoint → add a matching `WidgetId`** to `packages/shared/src/index.ts`
  (`WidgetId` union + `WIDGET_IDS` array + `DEFAULT_DASHBOARD_CONFIG`, disabled/opt-in by default).
- **User-owned tables that aren't Plaid-synced** (`manual_assets`, `budgets`, `goals`) carry a
  **direct `userId` column** + `onDelete: Cascade` to `Profile`, unlike Plaid-synced tables
  (`Liability`, `RecurringStream`, …) which scope transitively through `Account → PlaidItem`
  and never denormalize `userId`. Every mutation that can create the *first* row for a user
  must call the same `ensureProfile()` upsert `dashboard.service.ts` uses — a user can create
  a manual asset or goal before ever connecting a Plaid item, so `profiles` may not have a row
  yet.
- **A field that must survive a Plaid resync goes on a separate child table, never on the
  synced table itself.** `sync.service.ts`'s upsert `update` payload is built exclusively from
  its mapper's narrow return shape (e.g. `transaction.mapper.ts`'s `TransactionRecord`) — any
  column *not* in that mapper is structurally immune to being clobbered, which is exactly how
  `transaction_details`/`transaction_splits` coexist with resyncs. Never add a user-editable
  field into a Plaid mapper's return type.

## Working agreements

- Commits go **directly to `main`** (repo convention across all phases). Commit/push only when
  asked. End commit messages with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- **Destructive DB deletes require explicit user authorization** — don't delete rows the user
  didn't ask you to touch; surface them and ask.
- When you add a feature, keep the docs current: STATE.md (new §), SECURITY.md (if security
  surface changes), TODO.md (check the item off).
