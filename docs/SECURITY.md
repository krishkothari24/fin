# Security & Production Readiness

_Companion to [STATE.md](./STATE.md). Covers the Phase 6 hardening plus the Phase 13
go-live hardening pass: what protects the app today, the exact threat each control
addresses, and the remaining human-in-the-loop steps before a public launch._

## Trust model in one paragraph

Clients never talk to Postgres. They talk to the **NestJS API**, which is the only
thing holding a database connection and the only thing holding Plaid `access_token`s
(encrypted). Every route requires a valid Supabase JWT by default (`SupabaseJwtGuard`,
registered globally — see "Global default-deny auth guard" below) and every query is
filtered by `userId` in the service layer. As of Phase 13, the database itself
**also** enforces this for the request-driven part of the API (`FORCE ROW LEVEL
SECURITY` + a non-owner `app_runtime` role — see "RLS as a real backstop" below), not
just as documentation of intent. Everything else below is further defense-in-depth.

## Controls in place

| Control | Threat it addresses | Where |
|---|---|---|
| **AES-256-GCM** token encryption at rest | DB dump / backup leak exposes bank tokens | `crypto/` |
| **Supabase JWT** verification, global default-deny | unauthenticated access to user data, a future route shipping without auth | `auth/supabase-jwt.guard.ts`, `app.module.ts` (`APP_GUARD`) |
| **Service-layer authz** (`user_id` scoping) | user A reading user B's data via the API | every `*.service.ts` |
| **Postgres RLS, forced for `app_runtime`** (Phase 13) | a bug in service-layer `userId` filtering leaking cross-user data | migration `…_phase13_force_rls_app_runtime`, `prisma/prisma.service.ts` |
| **Postgres RLS for `authenticated`/`anon`** (Phase 6+) | direct DB access via the Supabase `anon`/`authenticated` keys | migration `…_phase6_rls` |
| **Fail-fast prod secret check** | a misconfigured deploy silently booting with a missing secret | `bootstrap.ts` (`assertProductionSecrets`) |
| **Webhook signature verify** (ES256 JWT) | forged Plaid webhooks | `sync/webhook-verification.service.ts` |
| **Rate limiting** (per-IP, `@nestjs/throttler`) | brute force / abuse / accidental floods | `app.module.ts`, `@Throttle`/`@SkipThrottle` |
| **helmet** headers, `x-powered-by` stripped | clickjacking, MIME sniffing, fingerprinting | `bootstrap.ts` |
| **Sanitizing exception filter** | leaking stack traces / SQL / Prisma internals | `observability/all-exceptions.filter.ts` |
| **CORS allowlist** | hostile browser origins calling the API | `bootstrap.ts` (opt-in via `CORS_ORIGINS`) |
| **Frontend CSP + security headers** | XSS exfiltrating the Supabase session token (stored in `localStorage`) | `apps/web/vercel.json` |
| **Structured logs + request ids** | no audit trail / uncorrelated errors | `observability/*` |
| **Sentry** (gated on `SENTRY_DSN`) | errors going unnoticed in prod | `observability/error-reporter.ts` |

## Global default-deny auth guard

`SupabaseJwtGuard` is registered as a global `APP_GUARD` (`app.module.ts`), so every
route requires a valid JWT **unless** explicitly marked `@Public()`
(`auth/public.decorator.ts`). Only two routes carry that annotation:
`GET /health` and `POST /plaid/webhook` (which has its own signature-based
verification instead — see `webhook-verification.service.ts`). Before Phase 13 the
guard was applied per-controller via `@UseGuards`; every controller had it, but
nothing structurally stopped a future one from shipping without it. A regression
test in `scripts/hardening-e2e.ts` (step 2b) asserts one representative route per
controller 401s with no token, and that the two `@Public()` routes stay reachable —
so this can't silently regress.

## RLS as a real backstop (Phase 13)

Before Phase 13, every RLS policy only applied to the Supabase `authenticated`/`anon`
roles — the API itself connected as the table **owner**, which bypasses RLS
regardless of policy, so RLS was documentation of an *unenforced* trust boundary, not
a backstop against a bug in this app's own code.

Phase 13 (migrations `…_phase13_force_rls_app_runtime` and
`…_phase13b_app_runtime_grant`) adds a second Postgres role, **`app_runtime`**:
non-owner, non-superuser, `NOBYPASSRLS`. Every user-scoped table gets
`FORCE ROW LEVEL SECURITY` plus a policy for `app_runtime` keyed on
`current_setting('app.user_id', true)::uuid` — the same ownership-chain joins the
`authenticated` policies already used (`accounts → plaid_items`, direct `userId` for
Phase 9–12 tables), just covering all of SELECT/INSERT/UPDATE/DELETE instead of only
SELECT, and *including* the encrypted token column (the API needs to read/write it;
`authenticated` never does).

**How the GUC gets set.** `PrismaService.withUserContext(userId, fn)`
(`prisma/prisma.service.ts`) opens one Postgres transaction, runs
`SELECT set_config('app.user_id', userId, true)`, then runs `fn` inside it.
Every model-delegate property and the raw/batch query methods on `PrismaService` are
overridden to transparently redirect to that transaction whenever one is open — so
every existing `this.prisma.x.y(...)` call site across every service works
unchanged. `UserContextInterceptor` (a global `APP_INTERCEPTOR`, runs right after the
auth guard) wraps every HTTP request this way automatically.

**What is deliberately exempt, and why.** Wrapping an entire unit of work in one
Postgres transaction is only safe if that unit of work is DB-only. Two classes of
call sites interleave slow external Plaid API calls with DB writes, and holding one
transaction open across that network I/O caused real `transaction timeout` and
`deadlock detected` errors in testing (proven live, against concurrent syncs of the
same item — exactly the scenario this app's own idempotency tests exercise):

- **The four pg-boss background jobs** (`SyncService`, `InvestmentsSyncService`,
  `LiabilitiesSyncService`, `RecurringSyncService`) and the daily snapshot cron
  (`SnapshotService`) run on **`PrismaOwnerService`** instead (`prisma/prisma-owner.service.ts`
  — a second client connected via `DIRECT_URL`, the owner role). They process one
  server-resolved `itemId` at a time, not arbitrary user-supplied query input, so the
  IDOR-defense-in-depth value of forcing RLS onto them is much lower than on the HTTP
  path — not worth the reliability cost. `QueueService` documents this in full.
- **`ItemsService`** (link-token, exchange, refresh, remove — everything that calls
  Plaid directly from an HTTP request) also uses `PrismaOwnerService`, and
  `ItemsController`/`PlaidLinkController` are marked `@SkipUserContext()`
  (`auth/skip-user-context.decorator.ts`) to opt out of the interceptor's wrapping.
  Every method already scopes its own queries by `userId` explicitly
  (`requireItem(userId, itemId)` before any Plaid call), so this is no less safe than
  the RLS path, just without the extra DB-level layer.
- **The Plaid webhook controller** resolves `PlaidItem` by Plaid's own `item_id`
  before any `userId` is known, which is exactly the kind of not-yet-user-scoped
  lookup `PrismaOwnerService` exists for.

Everything else — accounts, transactions, aggregations, dashboard, investments,
liabilities, recurring, manual-assets, budgets, goals — is pure DB read/write with no
external calls, runs through `UserContextInterceptor`, and gets the full FORCE RLS
treatment. This is also where the actual IDOR risk concentrates: arbitrary
user-supplied filters/ids driving queries, versus the item-lifecycle/background paths
which only ever touch one server-resolved item at a time.

**Proof.** `pnpm --filter @fin/api e2e:rls` (extended in Phase 13) proves, against
the live DB: `app_runtime` with no `app.user_id` set sees **zero** rows on a
FORCE-RLS table (deny by default — the actual point of the change); scoped to user A
it sees only A's account; an UPDATE aimed at user B's account while scoped to A
affects **zero** rows; and the encrypted token column *is* readable once correctly
scoped (unlike `authenticated`, which never gets that column at all).

**Cutover is a deploy-time step, not automatic.** `app_runtime` exists in the DB with
no password set (a `LOGIN` role with no password can never authenticate over the
network — safe to leave as-is until deliberately provisioned). `DATABASE_URL` still
points at the owner role in local dev and will continue to until the production
deploy explicitly sets it to `app_runtime`'s credentials — see the go-to-production
checklist.

## What RLS does for the Supabase `authenticated`/`anon` roles (unchanged since Phase 6)

**What it protects:** any *direct* database access through the Supabase
`authenticated` / `anon` roles (PostgREST, `supabase-js`, a leaked anon key). Under
those roles:

- a signed-in user can `SELECT` **only their own** rows (policies key on
  `auth.uid()`, joined through `plaid_items → accounts` for the child tables),
- **no** `INSERT/UPDATE/DELETE` is possible (no write grants) — writes are
  API-only,
- the encrypted `access_token_ciphertext` column is **not** granted, so it is
  never selectable even by its owner via that path,
- `webhook_events` (a system table) is invisible entirely.

The same pattern extends through every later phase's tables (Phase 7 investments,
Phase 8 liabilities/recurring, Phase 9–12 manual-assets/budgets/transaction-details/
goals): each is user-scoped via the same `accounts → plaid_items` (or direct
`userId`) join, SELECT-only for `authenticated`. `securities` (public market data)
and `webhook_events` are RLS-enabled with no grant/policy for `authenticated` at all
— invisible, same as before.

## Secrets handling

- All secrets live in `apps/api/.env` (gitignored) or the host's secret store.
  **Never** commit them or paste them in chat. `.env.example` documents the keys.
- `ENCRYPTION_KEY`, `PLAID_SECRET`, `SUPABASE_SECRET_KEY`, the DB URLs, and
  `app_runtime`'s DB password (Phase 13) are the sensitive set. (User JWTs are
  verified against Supabase's public JWKS endpoint — no shared secret involved.)
- Plaid `access_token`s are only ever stored encrypted and never sent to a client.
- Verified live (full git history scan): no secret has ever been committed, at any
  point, in this repo.

## Go-to-production checklist (human-in-the-loop — not automatable here)

These need your accounts/infra and are intentionally left as manual steps. Order
matters — do them roughly in this sequence:

1. **Request Plaid Production access** (dashboard → Production). Sandbox → Production
   only changes `PLAID_ENV` + keys; the code is environment-agnostic. Enable the
   products we use on the Production app: **Transactions, Investments, Liabilities**
   (Recurring Transactions is derived from Transactions — no separate entitlement).
   This can take review time — kick it off early.
2. **Provision `app_runtime`'s password** (Phase 13). The role already exists in the
   DB with no password (safe — a `LOGIN` role with no password can never
   authenticate). Set one directly against the DB, out-of-band, never in a file:
   `ALTER ROLE app_runtime WITH PASSWORD '<openssl rand -base64 24>';` Build the
   pooled connection string Supabase's convention expects —
   `postgresql://app_runtime.<project-ref>:<password>@<pooler-host>:6543/postgres?pgbouncer=true`
   (same host/project-ref as today's `DATABASE_URL`, just a different role/password)
   — and use it as **`DATABASE_URL`** for the production deploy only.
   **`DIRECT_URL` stays on the owner role** (migrations + pg-boss both need it).
3. **Import `render.yaml`** at Render, fill in every `sync: false` secret — including
   the new `app_runtime` `DATABASE_URL` from step 2, and **`PLAID_ENV=production`**
   (the blueprint no longer defaults this — you must set it explicitly).
4. **Public webhook URL** — set `PLAID_WEBHOOK_URL` to the deployed Render URL's
   `/api/plaid/webhook` and confirm a real `SYNC_UPDATES_AVAILABLE` round-trip.
5. **Deploy `apps/web`** and set `CORS_ORIGINS` on the API to its real origin.
6. **Turn on Sentry** — create a project, set `SENTRY_DSN`.
7. **Rotate** any secret ever exposed (none found live, but rotate anything that
   *was* ever pasted somewhere outside `.env`); confirm least-privilege DB
   credentials (this is exactly what step 2 does — `app_runtime` is the
   least-privilege runtime credential).
8. **Privacy** — publish a privacy policy (financial PII). You never touch bank
   credentials (Plaid Link does), so this is not PCI scope, but treat balances /
   transactions as sensitive personal data.

## Verifying the hardening

```bash
pnpm --filter @fin/api e2e:hardening   # headers, sanitized errors, 429 rate limit, skip-throttle,
                                        # every controller requires auth except the @Public() allow-list
pnpm --filter @fin/api e2e:rls         # two-user DB isolation via `authenticated`, AND app_runtime's
                                        # FORCE RLS: deny-by-default, correct per-user read/write scoping
```

Both require the dev-shell DB sandbox to be disabled (they open real Supabase
connections). After any change touching `prisma/prisma.service.ts`,
`prisma/prisma-owner.service.ts`, `QueueService`, or `ItemsService`, re-run the full
E2E suite listed in the root `CLAUDE.md` — this is the one part of the app where a
subtly wrong change fails silently (a query in the wrong client returns zero rows
instead of an error, which looks like "no data" rather than "broken").
