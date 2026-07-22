# fin-dashboard — Technical State of the Application

_Snapshot as of 2026-07-22 · Phases 1–13 complete (Phase 13 = go-live hardening: auth guard, prod
secrets, CSP, RLS backstop) · security → [SECURITY.md](./SECURITY.md)_

This document is the ground-truth of **what exists, how it works, and why** — written
to be read end-to-end by someone who has never touched Prisma, Plaid, or NestJS. It is
deliberately verbose. If you only read one section, read **§7 (Prisma explained)** and
**§8 (the port/connection saga)** — those cover the parts you said you'd never seen before.

---

## 1. What this product is

A **multi-tenant, external-facing financial dashboard SaaS**. Users sign up, connect their
own bank / credit / (later) investment accounts through **Plaid**, and see an aggregated
view — net worth, balances, transactions, spending by category, cash flow — and **choose
what to show** on their dashboard.

Key product constraints (these shape every technical decision):

- **Read-only for now.** The hosted app only reads financial data. No trade execution, no
  moving money. (Execution stays out of this codebase; the architecture leaves room to add
  it later, but nothing here does it.)
- **No AI / no ML anywhere.** All "intelligence" is deterministic aggregation. Plaid itself
  returns transaction categories (`personal_finance_category`), account types, and recurring
  streams — so we never need a model to categorize anything.
- **Multi-tenant.** Every row of data belongs to a specific user, and one user must never be
  able to see another's data. This is enforced in two independent layers (see §9).

**Backend + architecture only.** There is no frontend yet. Everything is verified with
scripted Plaid Sandbox runs, not a browser.

---

## 2. Where we are right now (phase status)

The build is organized into phases. 1–12 (backend) plus the `apps/web` frontend build (§26) are complete.

| Phase | Scope | Status |
|------:|-------|--------|
| **1** | Foundation: monorepo, NestJS app, Prisma schema + migration, env validation, auth guard, health check | ✅ **done** |
| **2** | Plaid Link + Item lifecycle: connect an institution, encrypt & store the token, list / refresh / remove | ✅ **done, verified live** |
| **3** | Sync pipeline: webhooks + `/transactions/sync` + background jobs (pull actual transactions) | ✅ **done, verified live** |
| **4** | Read & aggregation API: accounts, transactions, net worth, spending, cash flow | ✅ **done, verified live** |
| **5** | Dashboard config + daily balance snapshots (net-worth-over-time) | ✅ **done, verified live** |
| **6** | Hardening: RLS, rate limiting, structured logging, sanitized errors, helmet/CORS, Sentry | ✅ **done, verified live** |
| **7** | Plaid **Investments**: holdings/positions + investment transactions + read API | ✅ **done, verified live** |
| **8** | Plaid **Liabilities** (card/loan detail) + **Recurring Transactions** (subscriptions) + read APIs | ✅ **done, verified live** |
| **9** | **Manual Assets & Liabilities**: user-entered off-platform net worth (not Plaid-synced) | ✅ **done, verified live** |
| **10** | **Budgets**: monthly spend limit per Plaid category vs. actual spend | ✅ **done, verified live** |
| **11** | **Transaction notes/tags/category overrides/splits** | ✅ **done, verified live** |
| **12** | **Goals**: savings-target / debt-payoff tracking, optionally linked to a live account | ✅ **done, verified live** |
| — | **`apps/web` frontend**: the whole product surface as a Vite + React SPA (§26) | ✅ **done, verified live in browser** |
| **13** | **Go-live hardening**: global default-deny auth guard, fail-fast prod secrets, frontend CSP, and RLS as a real backstop (`FORCE ROW LEVEL SECURITY` + non-owner `app_runtime` role) | ✅ **done, verified live** |

**What "Phase 2 verified live" means concretely:** we ran a real end-to-end script against
your real Supabase database and Plaid's Sandbox. It connected the fake bank "First Platypus
Bank," pulled **12 accounts**, confirmed the access token was stored **encrypted** (no
cleartext in the DB), then listed, refreshed balances, and removed the connection cleanly.
That script is [sandbox-e2e.ts](../apps/api/scripts/sandbox-e2e.ts) and you can re-run it any
time (see §12).

**Phase 3 (verified live):** we now pull real **transactions**. The E2E connected First
Platypus Bank, ran `/transactions/sync`, and landed **48 categorized transactions** across 12
accounts — driven by the background pg-boss worker _and_ a direct call at the same time, both
converging to exactly 48 (idempotency proven). Cursor + `last_synced_at` persist; a re-sync
adds nothing; removing the item cascade-deletes its transactions. See §16.

**Phase 4 (verified live):** the read & aggregation API is up. The E2E connected the sandbox
bank, synced 48 transactions, then proved the numbers: net worth = **assets − liabilities**
(cross-checked against a raw sum), hiding an account (Plaid 401k, 23631.98) dropped assets by
exactly that amount, spending-by-category summed to the raw positive-amount total across 8
categories, and cash-flow's `net = income − outflow` held every month. See §17.

**Phase 5 (verified live):** per-user dashboard config ("choose what to show") + the daily
balance-snapshot job. The E2E round-tripped a config through the `dashboard_configs` JSONB,
then snapshotted 12 accounts and confirmed the net-worth **series is now non-empty** — today's
point (`−40452.32`) equals the current net worth exactly, and re-snapshotting doesn't duplicate.
See §18.

**Phase 6 (verified live):** the app is hardened for exposure — Postgres **RLS** (second
isolation layer, proven with a two-user DB-level isolation test), per-IP **rate limiting**,
**helmet** headers + CORS allowlist, a **sanitizing exception filter** (no stack/SQL leaks),
structured request logging with correlation ids, and **Sentry** (gated on `SENTRY_DSN`). See
§19 and [SECURITY.md](./SECURITY.md).

**What still needs _you_ (human-in-the-loop, not code):** requesting Plaid **Production**
access, a public webhook URL/tunnel for real webhook *delivery* (§16.6), turning on Sentry with
a DSN, and the production **deploy** (Render). These are enumerated in
[SECURITY.md](./SECURITY.md) → "Go-to-production checklist."

---

## 3. The stack, and why each piece

| Concern | Choice | Why it's here |
|---|---|---|
| Language | **TypeScript** | one type system shared between backend and the future web app |
| Framework | **NestJS 11** | modular (one folder per domain), dependency injection, scales as the API surface grows |
| ORM + migrations | **Prisma 6** | type-safe database access; generates a client from a schema; clean migration files. (§7) |
| Database + Auth | **Supabase** | managed Postgres + user login (Auth) + row-level security in one platform |
| Job queue | **pg-boss** (installed, not wired yet) | background jobs stored _in Postgres_ — no separate Redis server to run |
| Bank data | official **`plaid`** Node SDK | maintained, typed wrapper over Plaid's API |
| Token encryption | **AES-256-GCM** (Node `crypto`) | Plaid access tokens are encrypted before they touch the database |
| JWT verification | **`jose`** | verifies the login token Supabase issues to users |
| Env validation | **`zod` v4** | the app refuses to boot with a malformed `.env` |

Nothing here is exotic. The one deliberate, non-default choice worth knowing: **Prisma is
pinned to major version 6, not 7** — Prisma 7 removed the `url = env(...)` line from the
schema and forces a more complex "driver adapter" setup. v6 keeps the schema simple and
stable. (§7.6)

---

## 4. Repository layout

It's a **pnpm workspace monorepo** — one git repo containing multiple packages that can
depend on each other.

```
fin/
├─ package.json               # workspace root: scripts like `api:dev`, `api:build`
├─ pnpm-workspace.yaml        # says "packages live in apps/* and packages/*"
├─ tsconfig.base.json         # TypeScript settings every package inherits
├─ .gitignore                 # ignores node_modules, dist, and .env (secrets)
├─ .vscode/settings.json      # hides node_modules/dist from the editor (cosmetic)
├─ README.md
├─ docs/
│  └─ STATE.md                # ← this file
│
├─ packages/
│  └─ shared/                 # @fin/shared — TypeScript types shared with the future frontend
│     └─ src/index.ts         # DTOs, enums, the DashboardConfig shape
│
└─ apps/
   └─ api/                    # @fin/api — the NestJS backend (the whole product today)
      ├─ package.json
      ├─ nest-cli.json
      ├─ prisma/
      │  ├─ schema.prisma      # the database blueprint (§6)
      │  └─ migrations/        # generated SQL that builds the DB (§7.4)
      ├─ scripts/
      │  └─ sandbox-e2e.ts     # the live Plaid Sandbox end-to-end test
      └─ src/
         ├─ main.ts            # boot: create app, prefix routes with /api, start listening
         ├─ app.module.ts      # the root module — lists every feature module
         ├─ config/            # loads + validates .env
         ├─ prisma/            # PrismaService (the DB client as an injectable)
         ├─ crypto/            # AES-256-GCM encrypt/decrypt
         ├─ auth/              # SupabaseJwtGuard + @CurrentUser() decorator
         ├─ health/            # GET /api/health
         ├─ plaid/             # PlaidService — thin wrapper over the Plaid SDK
         └─ items/             # Item lifecycle: connect/list/refresh/remove + controllers
```

**Why a monorepo when there's only one app?** So that when the frontend is added
(`apps/web`), it can `import { AccountDto } from "@fin/shared"` and share the exact types the
API returns — no drift between what the server sends and what the client expects.

### How the packages depend on each other

```
apps/api  ──depends on──▶  packages/shared   (via "@fin/shared": "workspace:*")
```

`workspace:*` means "use the local copy in this repo," not a version from npm. `@fin/shared`
compiles to plain JS in its own `dist/`, which is why `api:build` builds shared _first_.

---

## 5. Request lifecycle — how a call flows through the app

Take the most complete path we have, connecting a bank:

```
  Client (future frontend)
     │  POST /api/plaid/exchange   { publicToken }
     │  Header: Authorization: Bearer <supabase JWT>
     ▼
  ┌─────────────────────────────────────────────────────────┐
  │ NestJS                                                    │
  │                                                           │
  │  1. SupabaseJwtGuard  ── verifies the JWT, sets req.user  │  auth/
  │           │                                               │
  │  2. PlaidLinkController.exchange(user, dto)               │  items/plaid-link.controller.ts
  │           │                                               │
  │  3. ItemsService.exchangeAndStore(userId, publicToken)   │  items/items.service.ts
  │        ├─ PlaidService.exchangePublicToken()  ───────────┼──▶ Plaid API
  │        ├─ PlaidService.getItemInstitution()   ───────────┼──▶ Plaid API
  │        ├─ CryptoService.encrypt(accessToken)             │  crypto/
  │        ├─ PrismaService.plaidItem.create()    ───────────┼──▶ Supabase Postgres
  │        ├─ PlaidService.getAccounts()          ───────────┼──▶ Plaid API
  │        └─ PrismaService.account.upsert() × N  ───────────┼──▶ Supabase Postgres
  │                                                           │
  └─────────────────────────────────────────────────────────┘
     │  { itemId, institutionName, accountsConnected }
     ▼
  Client
```

The three cross-cutting building blocks — **the guard** (auth), **the service** (Plaid
wrapper), **Prisma** (DB) — are each explained below.

### 5.1 Modules (the NestJS unit of organization)

Every folder under `src/` is a **module**: a bundle of a controller (HTTP routes) + a service
(logic) + whatever providers it needs. [app.module.ts](../apps/api/src/app.module.ts) imports
them all. The ones live today:

- `AppConfigModule` — loads `.env`, validates it, makes config globally injectable.
- `PrismaModule` — provides the one shared `PrismaService`.
- `CryptoModule` — provides `CryptoService`.
- `AuthModule` — provides `SupabaseJwtGuard`.
- `HealthModule` — `GET /api/health` → `{ status: "ok" }`. No DB, no auth. This is the
  "is the server alive" endpoint a host like Render pings.
- `ItemsModule` — the real feature: connecting and managing institutions.

A comment in that file lists the modules Phase 3+ will add: `SyncModule`, `AccountsModule`,
`TransactionsModule`, `AggregationsModule`, `DashboardModule`.

### 5.2 Dependency injection, in one sentence

You never write `new PlaidService()`. You declare `constructor(private plaid: PlaidService)`
and NestJS hands you the single shared instance. That's why `ItemsService` can just _ask_ for
`PlaidService`, `PrismaService`, and `CryptoService` and trust they're wired up.

---

## 6. The data model (7 tables)

Defined in [schema.prisma](../apps/api/prisma/schema.prisma). All table names are `snake_case`
in Postgres (via `@@map`); the TypeScript names are `PascalCase`.

```
profiles ──1:N──▶ plaid_items ──1:N──▶ accounts ──1:N──▶ transactions
   │                                       │
   │                                       └──1:N──▶ balance_snapshots
   └──1:1──▶ dashboard_configs

webhook_events   (standalone audit log)
```

| Table | One row = | Key columns / notes |
|---|---|---|
| **profiles** | one signed-up user | `id` is the **Supabase auth user id** (a UUID). Supabase owns the real identity table (`auth.users`); this is our app-side mirror so we can hang data off it. |
| **plaid_items** | one connected institution | The sensitive table. Holds `access_token_ciphertext` (encrypted, never plaintext), `plaid_item_id` (unique), `institution_name`, `status` (`good`/`login_required`/`error`), and `transactions_cursor` (Phase 3 uses this). |
| **accounts** | one account inside an institution | e.g. a checking account. `current_balance` / `available_balance` are `DECIMAL(20,4)` (never float — see below). `is_hidden` is the user's "don't show this" choice. |
| **transactions** | one transaction | `plaid_transaction_id` unique. **`amount` follows Plaid's sign convention: positive = money _out_ of the account.** `pfc_primary`/`pfc_detailed` are Plaid's categories. Indexed on `(account_id, date)` for fast date-range queries. **Empty until Phase 3.** |
| **balance_snapshots** | one account's balance on one day | Powers net-worth-over-time without any AI: a daily job (Phase 5, §18.2) writes one row per account per day. Unique on `(account_id, date)`. |
| **dashboard_configs** | one user's preferences | `config` is a JSON blob: which widgets, their order, hidden accounts, default range. This _is_ "choose what to show." One row per user. |
| **webhook_events** | one webhook Plaid sent us | Raw audit + idempotency for Phase 3. |

Two things worth internalizing:

- **Money is `DECIMAL(20,4)`, never a float.** Floating point can't represent `0.10`
  exactly; decimals can. In TypeScript these come back as **strings**, which is why every
  money field in the shared DTOs (§10) is typed `string`, not `number`. Do the math with a
  decimal library, never `parseFloat`.
- **`onDelete: Cascade` everywhere down the tree.** Delete a profile → its items, accounts,
  transactions, snapshots all delete automatically. This is why `removeItem` can just delete
  the item row and trust the accounts/transactions under it vanish.

---

## 7. Prisma, explained from zero

You said you've never used Prisma. Here's the whole mental model.

### 7.1 What Prisma _is_

Prisma is an **ORM** — a tool that lets you read/write the database using typed TypeScript
objects instead of hand-written SQL strings. Three moving parts:

1. **`schema.prisma`** — one file that describes your tables (the "models"). It's the single
   source of truth for your database shape.
2. **The generated client** — Prisma reads that schema and _generates_ a TypeScript library
   with methods like `prisma.account.findMany(...)`, fully typed to your tables. You import
   it as `@prisma/client`.
3. **Migrations** — Prisma diffs your schema against the database and writes the SQL needed
   to make the database match.

So the workflow is: **edit `schema.prisma` → generate the client → create a migration →
apply it.**

### 7.2 `prisma generate` vs `prisma migrate` (the two commands people confuse)

- **`prisma generate`** — regenerates the TypeScript client from the schema. Touches **no
  database**. You run it after changing the schema so your code sees the new types. It's
  cheap and offline. (Our `package.json` script: `prisma:generate`.)
- **`prisma migrate dev`** — looks at the schema, generates a new SQL migration file, and
  **applies it to the database**. This _does_ touch the DB. (Script: `prisma:migrate`.)
- **`prisma migrate deploy`** — applies already-created migrations without generating new
  ones. This is the production command a deploy pipeline runs. (Script: `prisma:deploy`.)

### 7.3 How Prisma is wired into NestJS here

[prisma.service.ts](../apps/api/src/prisma/prisma.service.ts) is tiny but deliberate:

```ts
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

`PrismaService` **is** a Prisma client (it `extends PrismaClient`), just repackaged as
something NestJS can inject. Notice there's **no `onModuleInit` that connects**. That's on
purpose: Prisma **connects lazily** — on the first query, not at boot. So the API starts up
fine even if the database is unreachable or `DATABASE_URL` is blank; a query only fails when
you actually run one. This is why the health check works with zero configuration.

### 7.4 Our actual migration

There is exactly **one** migration so far:
`prisma/migrations/20260707005941_init/migration.sql`. It's the plain SQL Prisma generated
from the schema — `CREATE TYPE`, `CREATE TABLE ×7`, the indexes, and the foreign keys. You
can open it and read it like normal SQL; nothing is hidden. When we change the schema in
Phase 3 (e.g. add a table), Prisma will write a _second_ migration next to this one. The
folder of migrations, applied in order, _is_ the database's history.

### 7.5 The two database URLs (this is the crux you asked about)

Look at the datasource block in the schema:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")   // pooled  — app queries
  directUrl = env("DIRECT_URL")     // direct  — migrations
}
```

Prisma uses **two different connections to the same database**, and Supabase _requires_ this.
The full "why" is §8 — but the short version:

- **`DATABASE_URL`** points at Supabase's **connection pooler** (host `...pooler.supabase.com`,
  **port 6543**). The app's normal queries go here. A pooler multiplexes many short-lived app
  queries over a small number of real DB connections — essential when a server handles many
  requests.
- **`DIRECT_URL`** points at the database **directly** (**port 5432**). Migrations go here,
  because changing table structure (DDL) needs a real, non-pooled session — the pooler can't
  run migrations reliably.

You get both strings from Supabase in one place: **Dashboard → Connect → ORM → Prisma**. That
preset literally hands you `DATABASE_URL` and `DIRECT_URL` pre-filled. (That's the answer to
your earlier "there are different ways to connect — framework/direct/server/orm/mcp" question:
for Prisma, always pick **ORM → Prisma**.)

### 7.6 Why Prisma is pinned to v6

Prisma **7** removed the `url = env("DATABASE_URL")` line from the schema and requires a
"driver adapter" + a separate `prisma.config.ts` file — a bigger, more fragile setup. When a
generate command failed with `P1012 "datasource property url is no longer supported"`, I
pinned both `prisma` and `@prisma/client` to `^6` (currently 6.19.3). Keep them on 6 together;
never bump one without the other.

---

## 8. The port/connection saga (the "P1001" red herring)

This is the confusing episode from before the summary. Worth understanding because it _will_
look like a broken database again, and it isn't.

**What happened:** running `prisma migrate` failed with:

```
P1001: Can't reach database server at ...:5432
```

That error _screams_ "your database is down / your password is wrong / your network is
broken." **All of that was fine.** Here's how we proved it:

1. `nc -zv <host> 5432` and `nc -zv <host> 6543` → both ports **reachable**.
2. `psql "$DIRECT_URL" -c 'select 1'` → returned `1` **successfully** — real login, real
   query, over SSL, worked.

So the database, the credentials, the SSL, the URLs — all correct. Yet Prisma still said
"can't reach server."

**The actual cause:** the shell tool I run commands in is **sandboxed**, and that sandbox
blocks network access _for subprocesses that Prisma spawns_. Prisma doesn't connect from the
main node process — it shells out to a separate **query-engine binary**, and _that_
subprocess is what the sandbox was silencing. `nc` and `psql` are direct processes, so they
worked; Prisma's spawned engine did not. The `P1001` was Prisma mistranslating "my
subprocess's socket was blocked" into "the server is unreachable."

**The fix / the rule going forward:** any command that touches the database or calls Plaid
must be run **with the sandbox disabled** (the Bash tool's `dangerouslyDisableSandbox: true`).
That's not a security hole in the app — it's purely about _this development shell_ being
allowed to open outbound network connections. Once disabled, the migration applied instantly
and the live E2E passed.

**How you'd recognize it again:** if you ever see `P1001` (or a Plaid call hang/timeout) but
`psql`/`nc` to the same host works, it's the sandbox, not the database. It has nothing to do
with your Supabase project or your `.env`.

---

## 9. Security model

Financial data for external users — so security is not a phase-6 afterthought, several pieces
are already in place:

1. **Plaid access tokens are encrypted at rest.** [crypto.service.ts](../apps/api/src/crypto/crypto.service.ts)
   uses **AES-256-GCM**. Ciphertext is stored as `iv.tag.data` (three base64 chunks joined by
   dots). The **GCM auth tag** means a _tampered_ ciphertext fails to decrypt loudly rather
   than returning garbage. The token is only ever decrypted _inside a single method call_ at
   the moment it's needed (e.g. to call Plaid), never held in the DB or logs in cleartext. The
   E2E explicitly asserts the stored value does **not** contain `access-sandbox` and has three
   dot-separated parts.
   - The key is `ENCRYPTION_KEY` — **32 bytes, base64** (`openssl rand -base64 32`). The
     service refuses to encrypt/decrypt if the key isn't exactly 32 bytes.
   - **Consequence to remember:** if you ever rotate/lose `ENCRYPTION_KEY`, every stored token
     becomes undecryptable and every connected item must be re-linked.

2. **User authentication.** [supabase-jwt.guard.ts](../apps/api/src/auth/supabase-jwt.guard.ts)
   verifies the `Authorization: Bearer <token>` JWT that Supabase issues at login against
   `${SUPABASE_URL}/auth/v1/.well-known/jwks.json` (ES256 asymmetric signing keys, via `jose`'s
   `createRemoteJWKSet`). On success it sets `req.user = { id, email }`.
   The `id` is the Supabase user's UUID — the same value that keys `profiles`. Any controller
   touching user data is annotated `@UseGuards(SupabaseJwtGuard)`, and reads the user via the
   `@CurrentUser()` decorator.

3. **Per-user isolation, layer 1 (application).** Every query is scoped by `userId`. E.g.
   `requireItem(userId, itemId)` does `findFirst({ where: { id: itemId, userId } })` — so
   asking for someone else's item id returns "not found," never their data.

4. **Per-user isolation, layer 2 (database RLS) — live as of Phase 6 (§19.1).** Postgres
   Row-Level Security now locks the *direct* database surface: under the Supabase
   `authenticated` role a user can read only their own rows and cannot write at all. The API
   connects as the owner (which bypasses RLS by design), so this is defense-in-depth around the
   app-level gate, not a replacement for it. See [SECURITY.md](./SECURITY.md) for exactly what it
   does and doesn't cover.

5. **Secrets never in git or chat.** `.env` is gitignored; only `.env.example` (blank
   placeholders) is committed. `git status` is clean and `node_modules`/`.env` are never
   staged.

**What's still owed (Phase 6):** RLS policies, rate limiting, structured request logging,
Sentry error monitoring, and requesting Plaid **Production** access (we're on Sandbox).

---

## 10. The shared types (`@fin/shared`)

[packages/shared/src/index.ts](../packages/shared/src/index.ts) is the **API contract** — the
shapes the API returns, importable by the future frontend so both sides agree. Highlights:

- `ItemStatus`, `AccountType` — domain enums. `LIABILITY_TYPES = ["credit", "loan"]` encodes
  that depository/investment are _assets_ and credit/loan are _liabilities_ (net-worth math
  in Phase 4 leans on this).
- `AccountDto`, `TransactionDto`, `NetWorthDto`, `CategorySpendDto` — response shapes. **Every
  money field is `string`** (see the DECIMAL note in §6).
  - `TransactionDto.amount` carries the comment "positive = money out" so nobody forgets
    Plaid's sign convention.
- `DashboardConfig` + `DEFAULT_DASHBOARD_CONFIG` — the "choose what to show" model: a list of
  widgets (`net_worth`, `accounts`, `spending_by_category`, `recent_transactions`,
  `cash_flow`, `recurring`) with `enabled` + `order`, plus `hiddenAccountIds`,
  `defaultRangeDays`, and `currency`. This is the default a brand-new user gets, served by the
  `/dashboard/config` endpoints as of Phase 5 (§18.1).

As of Phase 4 the response DTOs (`AccountDto`, `TransactionDto`, `NetWorthDto`,
`CategorySpendDto`, plus `CashFlowPointDto` and `TransactionsPage`) are what the read endpoints
actually return, mapped from Prisma rows by the pure functions in `account.dto.ts` /
`transaction.dto.ts`. As of Phase 5, `DashboardConfig` + `DEFAULT_DASHBOARD_CONFIG` (and the
`WIDGET_IDS` runtime list used to validate incoming configs) back the real `/dashboard/config`
endpoints.

---

## 11. Plaid integration, as it stands

[plaid.service.ts](../apps/api/src/plaid/plaid.service.ts) is a **thin wrapper** — it knows how
to talk to Plaid and nothing else (no DB, no business rules; that's `ItemsService`'s job).
Configured from `PLAID_ENV` (`sandbox`/`production`), `PLAID_CLIENT_ID`, `PLAID_SECRET`, and an
optional `PLAID_WEBHOOK_URL`.

The Plaid "Link" flow, in plain terms:

```
1. App asks Plaid for a link_token           →  createLinkToken(userId)
2. Frontend opens Plaid Link with that token, user picks their bank + logs in
   (we never see bank credentials — Plaid does)
3. Plaid hands the frontend a short-lived public_token
4. Frontend sends public_token to our API    →  POST /api/plaid/exchange
5. We exchange it for a permanent access_token + item_id  → exchangePublicToken()
6. We encrypt the access_token and store the Item + its accounts
```

Methods implemented today: `createLinkToken` (new connection), `createUpdateLinkToken`
(re-auth an item stuck in `login_required`), `exchangePublicToken`, `getItemInstitution`,
`getInstitutionName`, `getAccounts`, `getBalances`, `removeItem`, and `sandboxCreatePublicToken`
(Sandbox-only shortcut that mints a `public_token` without a frontend — this is what the E2E
uses).

**Endpoints live today** (all under the global `/api` prefix, all require a Supabase JWT
except health):

| Method + path | Does |
|---|---|
| `GET  /api/health` | liveness — `{ status: "ok" }`, no auth |
| `POST /api/plaid/link-token` | mint a link_token to start a connection |
| `POST /api/plaid/exchange` | exchange public_token → store encrypted Item + accounts |
| `GET  /api/items` | list the user's connected institutions |
| `POST /api/items/:id/reauth-token` | mint an update-mode link_token to re-auth |
| `POST /api/items/:id/refresh` | re-pull balances for that item |
| `DELETE /api/items/:id` | Plaid `/item/remove` + purge local rows |
| `POST /api/plaid/webhook` | **public, signature-verified**; on `SYNC_UPDATES_AVAILABLE` enqueues a sync (Phase 3) |
| `GET  /api/accounts` | list the user's accounts (with institution + balances) |
| `PATCH /api/accounts/:id` | hide/show or rename an account |
| `GET  /api/transactions` | filter (date/account/category/search) + paginate |
| `GET  /api/aggregations/net-worth` | assets − liabilities (`?series=true` for the timeseries) |
| `GET  /api/aggregations/spending` | spending by category (date-range) |
| `GET  /api/aggregations/cash-flow` | income vs outflow per month (date-range) |
| `GET  /api/dashboard/config` | the user's saved dashboard config (or defaults) |
| `PUT  /api/dashboard/config` | save the dashboard config (validated) |
| `GET  /api/investments/holdings` | positions + portfolio totals (value / cost basis / gain-loss) — Phase 7 (§20) |
| `GET  /api/investments/transactions` | investment txns (filter account/date/type) + paginate — Phase 7 |

**Phase 6 added no new endpoints — hardening only** (RLS, rate limiting, logging, sanitized
errors, helmet/CORS). Every route above now runs behind the global rate limiter and returns the
sanitized error shape on failure; `link-token`/`exchange` carry a tighter per-IP cap. See §19.

---

## 12. How to run things

All commands from the repo root unless noted. **Anything that touches the DB or Plaid must run
with the dev-shell sandbox disabled** (see §8) — that's a property of my tool environment, not
something you do on your own machine.

```bash
# install everything (once)
pnpm install

# build shared types, then the API
pnpm api:build

# run the API in watch mode → http://localhost:3000/api/health
pnpm api:dev

# --- Prisma (run inside apps/api, or via pnpm --filter @fin/api) ---
pnpm --filter @fin/api prisma:generate   # regenerate client after schema edits (no DB)
pnpm --filter @fin/api prisma:migrate    # create + apply a new migration (touches DB)
pnpm --filter @fin/api prisma:deploy     # apply existing migrations (prod/deploy)

# --- Unit tests (Jest) ---
pnpm --filter @fin/api test              # mappers + DTOs (12 tests)

# --- Live Plaid Sandbox end-to-end ---
pnpm --filter @fin/api e2e:sandbox       # Phase 2: connect → verify encrypted → remove
pnpm --filter @fin/api e2e:sync          # Phase 3: connect → /transactions/sync → verify → idempotency → purge
pnpm --filter @fin/api e2e:read          # Phase 4: seed → accounts/transactions/aggregations invariants → purge
pnpm --filter @fin/api e2e:dashboard     # Phase 5: config round-trip + snapshot → non-empty net-worth series → purge
pnpm --filter @fin/api e2e:rls           # Phase 6: two-user RLS isolation via the authenticated role → purge
pnpm --filter @fin/api e2e:hardening     # Phase 6: HTTP headers, sanitized errors, 429 rate limit, skip-throttle
pnpm --filter @fin/api e2e:investments   # Phase 7: holdings + investment txns sync, totals, hidden-exclusion, idempotency → purge
```

**What's tested automatically:**
- `crypto.service.spec.ts` — encrypt/decrypt round-trip, fresh IV each time, tamper is
  rejected, missing-key throws.
- `account.mapper.spec.ts` — Plaid account → DB row mapping.
- `transaction.mapper.spec.ts` — Plaid transaction → DB row (amount precision, date parsing,
  missing optionals).
- `account.dto.spec.ts` / `transaction.dto.spec.ts` — Prisma row → API DTO (decimals→strings, date format).
- `sandbox-e2e.ts` / `sync-e2e.ts` / `read-e2e.ts` — the live integration paths (need a real `.env`).

---

## 13. Configuration (`.env`)

The API validates env at boot with zod ([env.validation.ts](../apps/api/src/config/env.validation.ts)).
Secrets are **optional** so the app can boot for health checks without them; a service throws a
clear error only if it actually needs a missing secret. One subtlety we fixed: **blank values
(`FOO=`) are treated as unset** — otherwise an empty `SUPABASE_URL=` failed the `.url()` check.
Template lives in [.env.example](../apps/api/.env.example); real values go in
`apps/api/.env` (gitignored). Keys:

| Key | Purpose |
|---|---|
| `DATABASE_URL` | Supabase **pooled** connection (port 6543) — app queries |
| `DIRECT_URL` | Supabase **direct** connection (port 5432) — migrations |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | Supabase Auth; `SUPABASE_URL` also verifies user login JWTs via its JWKS endpoint |
| `PLAID_ENV` | `sandbox` today, `production` at launch |
| `PLAID_CLIENT_ID`, `PLAID_SECRET` | Plaid API credentials |
| `PLAID_WEBHOOK_URL` | public HTTPS URL Plaid posts webhooks to (Phase 3; a tunnel in dev) |
| `ENCRYPTION_KEY` | 32-byte base64 key for token encryption — `openssl rand -base64 32` |

---

## 14. What's next (post Phase 6)

The whole backend build is done (Phases 1–6, §19). What remains is **not code** — it needs your
accounts/infra, and is enumerated in [SECURITY.md](./SECURITY.md) → "Go-to-production checklist":

1. Request **Plaid Production** access (Sandbox → Production is just `PLAID_ENV` + keys).
2. **Webhook delivery** end-to-end: point `PLAID_WEBHOOK_URL` at a tunnel/deploy and verify a
   real `SYNC_UPDATES_AVAILABLE` round-trip (§16.6).
3. Turn on **Sentry** (set `SENTRY_DSN`) and **deploy** the web service + worker (e.g. Render,
   with `TRUST_PROXY=1`, `CORS_ORIGINS`, secrets in host env).
4. Wire **real Supabase login** on a frontend so JWTs come from actual sign-ups (the guard
   already verifies them; there's just no UI yet).

Fast-follows / future product: Plaid **Liabilities** (card/loan APR + due dates) and **Recurring
Transactions** (subscriptions view), and the `apps/web` frontend the monorepo is structured for.
(Plaid **Investments** — holdings + investment transactions — shipped in Phase 7, §20.)

---

## 15. Glossary (quick reference)

- **Item** (Plaid term) — one _connection to one institution_ for one user. One access_token
  per Item. An Item can contain several accounts.
- **access_token** — the permanent secret that lets us pull a user's data from Plaid. Encrypted
  at rest here. Never sent to the client.
- **public_token** — short-lived token the frontend gets from Plaid Link; we immediately trade
  it for an access_token.
- **cursor** (`/transactions/sync`) — a bookmark. Each sync returns a new cursor; next time we
  pass it back to get only what changed since.
- **PFC** — `personal_finance_category`, Plaid's own category for a transaction
  (`pfc_primary` / `pfc_detailed`). This is why we need no AI to categorize.
- **RLS** — Row-Level Security, a Postgres feature that filters rows by policy at the database
  level. Our second isolation layer, live as of Phase 6 (§19.1).
- **pooler / port 6543 vs direct / port 5432** — see §7.5 and §8.
- **P1001** — Prisma's "can't reach database" error. In our dev shell it usually means the
  sandbox blocked Prisma's engine subprocess, _not_ a real DB problem (§8).
- **DECIMAL(20,4)** — exact decimal money type; comes back as a **string** in TS. Never float.
- **GCM auth tag** — the part of AES-GCM that detects tampering; a modified ciphertext fails
  to decrypt instead of returning garbage.
- **pg-boss** — a job queue that stores jobs _in Postgres_ (no Redis). Powers background syncs (§16).
- **cursor pagination** — `/transactions/sync` returns updates in pages; loop while `has_more`.

---

## 16. Phase 3 in depth — the sync pipeline

This is the machinery that turns "a connected bank" into "rows in the `transactions` table."
All of it lives in [apps/api/src/sync/](../apps/api/src/sync/).

### 16.1 The shape of the pipeline

```
   Plaid ──webhook (SYNC_UPDATES_AVAILABLE)──▶ POST /api/plaid/webhook
                                                     │  (signature-verified)
                                                     ▼
                                            QueueService.enqueueSync(itemId)
                                                     │  (pg-boss job in Postgres)
                                                     ▼
                                            worker ──▶ SyncService.syncItem(itemId)
                                                     │
                            ┌────────────────────────┴───────────────────────┐
                            ▼                                                  ▼
                 /transactions/sync (loop pages)                    upsert accounts +
                 added / modified / removed                         transactions, advance cursor
```

The same `SyncService.syncItem` also runs once right after a bank connects (`ItemsService`
enqueues an initial sync in `exchangeAndStore`).

### 16.2 `/transactions/sync` and the cursor (the core idea)

Plaid's transactions endpoint is **cursor-based**, not "give me a date range." You call it with
a `cursor` (a bookmark). It returns three lists — `added`, `modified`, `removed` — plus a
`next_cursor` and `has_more`. You:

1. Start with **no cursor** (first ever sync = the whole history).
2. Apply the page: upsert `added` + `modified`, delete `removed`.
3. Save `next_cursor` to `plaid_items.transactions_cursor`.
4. If `has_more`, loop with the new cursor; else stop.

Next time (triggered by a webhook), you resume **from the saved cursor**, so you only ever
process what changed. [sync.service.ts](../apps/api/src/sync/sync.service.ts) persists the cursor
**after every page**, so a crash mid-sync resumes rather than restarting.

### 16.3 Why it's safe to run twice (idempotency)

The E2E deliberately let the background worker and a direct call sync the **same item at the
same time** — both landed exactly 48 transactions, and a third sync added 0. That safety comes
from two things: transactions are **upserted** keyed on the unique `plaid_transaction_id` (a
repeat is an update, not a duplicate), and `removed` is a delete-by-id. So a re-run, an
overlapping run, or a replayed webhook all converge to the same correct state.

### 16.4 pg-boss and the connection it uses

[queue.service.ts](../apps/api/src/sync/queue.service.ts) wraps **pg-boss**, a queue that stores
jobs in Postgres (it creates its own `pgboss` schema — you'll see it appear in Supabase). We
enqueue on connect/webhook and a worker in the same process drains it, so the HTTP request
returns immediately instead of blocking on a multi-second Plaid sync.

**Important:** pg-boss connects with **`DIRECT_URL`** (Supabase session pooler, :5432), _not_
`DATABASE_URL` (transaction pooler, :6543). It needs session-level features (advisory locks) that
the transaction pooler doesn't keep across statements — see §7.5/§8. The queue is best-effort at
boot: if it can't start, the API still serves HTTP and `enqueueSync` just logs and no-ops.

### 16.5 Webhook security (`POST /api/plaid/webhook`)

The webhook is **public** (Plaid can't send a Supabase login token) but every request is
verified before we act, in [webhook-verification.service.ts](../apps/api/src/sync/webhook-verification.service.ts):
Plaid signs each webhook with an **ES256 JWT** in the `Plaid-Verification` header. We check the
signature against Plaid's published key (`kid`), that the token is **fresh** (issued < 5 min ago,
replay defense), and that **sha256(raw body)** equals the JWT's `request_body_sha256` claim.
That last check is why `main.ts` boots with `rawBody: true` — we hash the exact bytes Plaid
hashed, not the re-serialized JSON. Only `SYNC_UPDATES_AVAILABLE` enqueues a sync; item
`ERROR` → `ITEM_LOGIN_REQUIRED` flips the item's `status` to `login_required` so the UI can
prompt a reconnect. Every webhook is logged to `webhook_events` for audit.

### 16.6 What's verified vs. what still needs a tunnel

The **sync engine** (initial + incremental + idempotency + cascade delete) is proven live
against Supabase + Sandbox by [sync-e2e.ts](../apps/api/scripts/sync-e2e.ts). The **webhook HTTP
path** is built and typechecked, but Plaid can only _deliver_ a real signed webhook to a public
URL — so end-to-end webhook delivery needs `PLAID_WEBHOOK_URL` pointed at a tunnel (or a deploy).
`sandbox/item/fire_webhook` triggers a real delivery once such a URL exists.

---

## 17. Phase 4 in depth — read & aggregation API

Three modules, all **plain reads** over data we already have — no Plaid calls, no queue. Each
is user-scoped by the auth guard, and money crosses the wire as **strings** (§6).

### 17.1 The two invariants every endpoint respects

1. **Hidden accounts are excluded** from aggregations. `is_hidden` is the user's "don't count
   this" switch (set via `PATCH /accounts/:id`); every aggregation query filters `isHidden: false`.
2. **Plaid's sign convention.** A transaction `amount > 0` is money **out** (spending); `< 0` is
   money **in** (income). Get this backwards and every number inverts — so it's asserted in the E2E.

### 17.2 Accounts — [accounts/](../apps/api/src/accounts/)

`GET /accounts` lists the user's accounts joined to their institution name; `PATCH /accounts/:id`
hides/shows or renames one (ownership checked via `item: { userId }` before the update). Prisma
`Decimal` balances become strings in the pure mapper [account.dto.ts](../apps/api/src/accounts/account.dto.ts).

### 17.3 Transactions — [transactions/](../apps/api/src/transactions/)

`GET /transactions` filters on date range, account, category (`pfc_primary`), a case-insensitive
search over name/merchant, and `pending`, then offset-paginates (`limit` ≤ 200, default 50)
newest-first. Returns `{ transactions, total, limit, offset }`. The query DTO is validated by
class-validator; the global `ValidationPipe` (`forbidNonWhitelisted`) rejects unknown params.

### 17.4 Aggregations — [aggregations/](../apps/api/src/aggregations/)

- **Net worth** = `assets − liabilities`, where assets = Σ balances of `depository`+`investment`
  accounts and liabilities = Σ balances of `credit`+`loan` accounts (both via Prisma `aggregate`,
  math in `Prisma.Decimal` for exactness). `?series=true` adds the daily timeseries — a raw SQL
  join over `balance_snapshots`, populated daily as of Phase 5 (§18.2).
- **Spending** groups non-pending, `amount > 0` transactions by `pfc_primary` (Prisma `groupBy`),
  largest first.
- **Cash flow** is a raw SQL query bucketing by `date_trunc('month', date)`, summing income
  (`amount < 0`, flipped) and outflow (`amount > 0`) per month; `net = income − outflow`.

Why raw SQL for two of these: grouping by a *derived* month and doing conditional sign-sums is
awkward in the Prisma query API but trivial in SQL. Both raw queries are parameterized
(`${userId}::uuid`) — no string interpolation — and join through `plaid_items` so they're strictly
user-scoped.

### 17.5 What the live E2E proved

[read-e2e.ts](../apps/api/scripts/read-e2e.ts) seeded 48 real sandbox transactions, then checked
the numbers rather than just "200 OK": `netWorth == assets − liabilities` and assets matched an
independent raw sum; **hiding** the Plaid 401k (23631.98) dropped assets by exactly that;
spending-by-category summed to the raw positive-amount total (8 categories); and cash-flow's
`net == income − outflow` held for all 3 months.

---

## 18. Phase 5 in depth — dashboard config + balance snapshots

Two pieces: the user's "choose what to show" preferences, and the daily job that makes
net-worth-over-time real.

### 18.1 Dashboard config — [dashboard/](../apps/api/src/dashboard/)

`GET /dashboard/config` returns the user's saved config, or `DEFAULT_DASHBOARD_CONFIG` if they
have none (or the stored blob is malformed). `PUT /dashboard/config` validates the body against
a class-validator DTO — every widget `id` must be one of `WIDGET_IDS`, `hiddenAccountIds` must be
UUIDs, `defaultRangeDays` 1–365, `currency` a 3-char code — then upserts it into the
`dashboard_configs` JSONB (creating the `profiles` row first, since it's an FK target).

**Two independent "hide" mechanisms — don't confuse them:**
- `Account.is_hidden` (a real column, set via `PATCH /accounts/:id`) → **excluded from
  aggregation math** (net worth, spending). This is what §17.1 enforces.
- `DashboardConfig.hiddenAccountIds` (inside the JSON blob) → a **visual dashboard preference**
  (which account cards to collapse). It does **not** change any totals.

**jsonb note:** Postgres reorders object keys in `jsonb`, so a config read back has the same
*values* but not the same key *order* as what you sent. That's fine for a JSON API (clients read
by key) — the E2E compares structurally, not by string, for exactly this reason.

### 18.2 Balance snapshots — [snapshot.service.ts](../apps/api/src/sync/snapshot.service.ts)

`SnapshotService.snapshotAllBalances()` writes one `balance_snapshots` row per account for
*today* (current + available balance), **upserting** on the unique `(account_id, date)` — so
running it twice a day just updates today's row (idempotent, proven in the E2E). It snapshots the
balances already stored on each account (kept fresh by every transaction sync), so it makes **no
Plaid calls**.

These rows are what the net-worth **series** (§17.4) reads: before Phase 5 that query returned
nothing; now each day adds a point, and the E2E confirmed today's point equals the current
net worth to the cent.

### 18.3 How it's scheduled (pg-boss cron)

[queue.service.ts](../apps/api/src/sync/queue.service.ts) registers a second queue,
`snapshot-balances`, with a worker that runs the snapshot, and schedules it **daily at 06:00 UTC**
via pg-boss's built-in cron (`boss.schedule`). pg-boss persists the schedule in Postgres and
fires it once cluster-wide, so it survives restarts and won't double-run across instances. The
E2E calls `snapshotAllBalances()` directly (you can't wait a day in a test); the cron just
automates that same call.

---

## 19. Phase 6 in depth — hardening & prod readiness

The feature build was done at Phase 5; Phase 6 adds the layers that make the API safe to expose
on the public internet. Nothing here changes what the endpoints return — it changes what happens
around them. Full rationale + threat table live in [SECURITY.md](./SECURITY.md); this section is
the mechanics.

### 19.1 Row-Level Security (RLS) — the second isolation layer

Layer 1 (already there) is the API: every user route is behind `SupabaseJwtGuard`, and every
service scopes queries by `userId`. Layer 2 is now the **database itself**.

Migration [`20260707120000_phase6_rls`](../apps/api/prisma/migrations/20260707120000_phase6_rls/migration.sql):

- `ENABLE ROW LEVEL SECURITY` on all seven tables. With RLS on and no policy, non-owner roles
  see **nothing** (deny by default).
- For the Supabase `authenticated` role: a `SELECT` policy per user table keyed on `auth.uid()`
  (= the JWT `sub`). Child tables (`accounts`, `transactions`, `balance_snapshots`) join up
  through `plaid_items` to reach the owner. **No** write grants → the direct path is read-only.
- `plaid_items` grants **column-level** SELECT that **excludes** `access_token_ciphertext`, so
  the encrypted token is invisible even to its owner via that path. `webhook_events` gets no
  grant/policy at all → invisible.
- The Supabase-specific bits (the `authenticated` role, `auth.uid()`) run inside a
  `DO $$ … IF EXISTS (… rolname='authenticated') … $$` guard, so the same migration also applies
  cleanly to a plain local/CI Postgres.

**The key subtlety:** the API connects as the table **owner**, and an owner **bypasses RLS**
unless the table is set to `FORCE ROW LEVEL SECURITY` — which we deliberately do **not** do. So
RLS does **not** touch the app's own queries (the read/aggregation E2Es pass unchanged). RLS
here protects the *direct* database surface — anyone using the Supabase `anon`/`authenticated`
keys (PostgREST, `supabase-js`, a leaked key). To also make RLS a backstop against an API bug,
you'd `FORCE` it and `SET LOCAL app.user_id` per request as a non-owner role — the trade-off is
spelled out in SECURITY.md.

**Proof** — `pnpm --filter @fin/api e2e:rls` seeds two users, then, impersonating the
`authenticated` role for user B (`SET LOCAL ROLE authenticated` + a JWT-claims GUC), asserts B
sees exactly its own 1 account / 1 item / 1 txn, cannot select the token column, and cannot see
`webhook_events` — while the owner still sees everything.

### 19.2 Rate limiting

`@nestjs/throttler` with a global `ThrottlerGuard` ([app.module.ts](../apps/api/src/app.module.ts)),
per-IP, in-memory, env-tuned (`RATE_LIMIT_LIMIT` per `RATE_LIMIT_TTL` seconds, default 120/60s).
Because it's a **global** guard it runs *ahead* of the per-route `SupabaseJwtGuard`, so a flood is
rejected with 429 before it even reaches auth. `@SkipThrottle()` exempts the health check and the
Plaid webhook (Plaid controls delivery + legitimately retries — signature verification guards it,
not rate limiting). `@Throttle({ default: { limit: 15, ttl: 60_000 } })` puts a tighter cap on
`link-token`/`exchange`, which hit Plaid on every call. In-memory is correct for a single
instance; horizontal scale-out would want a shared store.

### 19.3 Structured logging + request correlation

[observability/](../apps/api/src/observability/):

- `request-context.ts` — an `AsyncLocalStorage` store holding `{ requestId, userId }`, so any
  layer can attach them to a log line without threading them through calls.
- `request-context.middleware.ts` — registered **first** (as plain Express middleware in
  [bootstrap.ts](../apps/api/src/bootstrap.ts), so it wraps everything). It assigns/echoes an
  `x-request-id`, opens the ALS scope, and on `res.on("finish")` writes **one** access-log line
  with method/path/status/durationMs/userId — capturing the *final* status for every response,
  including 401/429/404 that never reach a controller.
- `structured-logger.ts` — dependency-free: emits JSON lines (prod, or `LOG_JSON=true`) or pretty
  lines (dev), request id folded in from ALS.

### 19.4 Sanitizing exception filter

`all-exceptions.filter.ts` (global via `APP_FILTER`) is the single place errors become HTTP
responses. Deliberate 4xx (`HttpException`) pass through with their message. **Anything else** is
an unexpected 500: the full error + stack is logged server-side and sent to Sentry, but the client
gets only `{ statusCode: 500, error, message: "Something went wrong…", requestId, path }` — no
stack, SQL, or Prisma internals leak. Every error body carries the `requestId` so a user report
maps to a server log line.

### 19.5 Sentry, helmet, CORS, proxy, shutdown

- **Sentry** (`error-reporter.ts`) — gated entirely on `SENTRY_DSN`. Importing it patches nothing;
  only `initErrorReporter()` (at boot, when a DSN exists) turns it on. Off ⇒ `captureError` is a
  no-op, zero external calls.
- **helmet** — security headers (nosniff, HSTS, frameguard) and strips `x-powered-by`.
- **CORS** — opt-in allowlist via `CORS_ORIGINS` (unset ⇒ no CORS headers; server-to-server
  callers unaffected). For the future `apps/web`.
- **`trust proxy`** — set `TRUST_PROXY=1` behind Render/LB so `req.ip` (the rate-limit key) is the
  real client, not the proxy.
- **`enableShutdownHooks()`** — clean pg-boss + Prisma shutdown on SIGTERM (Render sends it on
  redeploy), so in-flight jobs/connections close gracefully.

All of the above are applied by `applyHardening(app)` in [bootstrap.ts](../apps/api/src/bootstrap.ts),
shared by `main.ts` and the hardening E2E so the test exercises a byte-identical app.

### 19.6 Proof

`pnpm --filter @fin/api e2e:hardening` boots the real app on an ephemeral port and asserts over
HTTP: helmet headers present + `x-powered-by` stripped + `x-request-id` echoed; unauthenticated
and unknown-route responses use the sanitized shape (with `requestId`, no stack); the limiter
returns **429** past the budget; and `/health` stays 200 (skip-throttle works).

---

## 20. Phase 7 in depth — Plaid Investments (holdings + investment transactions)

Before this phase, investment/brokerage **balances** already flowed into net worth (an
investment account is just another account via `/accounts`). Phase 7 adds the *contents* of those
accounts: **what you own** (holdings/positions) and **what you traded** (investment transactions),
via Plaid's **Investments** product.

### 20.1 What's connected

The link-token now requests Investments as `required_if_supported_products: [Investments]`
([plaid.service.ts](../apps/api/src/plaid/plaid.service.ts)) — investment-capable institutions
grant holdings + investment transactions, while depository-only banks still link normally. Two new
Plaid calls: `/investments/holdings/get` and `/investments/transactions/get`.

### 20.2 Data model — 3 new tables

- **securities** — one row per security (stock/ETF/fund/cash): ticker, name, type, `close_price`.
  **Public market data, not user-scoped** — deduped across users by Plaid's `security_id`.
- **holdings** — a **current position**: quantity of one security in one account, with
  `institution_price`, `institution_value` (market value), `cost_basis`. Unique per
  `(account, security)`; it's a **snapshot**, replaced wholesale each sync.
- **investment_transactions** — buys/sells/dividends/fees/transfers. `amount` follows Plaid's sign
  (**positive = cash OUT**, e.g. a buy). Unique on the Plaid id; upserted.

### 20.3 The sync engine

[investments-sync.service.ts](../apps/api/src/investments/investments-sync.service.ts), a
background pg-boss job on the `sync-investments` queue (enqueued on connect and on
`HOLDINGS` / `INVESTMENTS_TRANSACTIONS` webhooks):

- **Holdings** — upsert securities, then **replace** this item's holdings in one atomic
  transaction (`deleteMany` + `createMany`) — holdings are a point-in-time snapshot, so a replace
  is the correct + idempotent model (re-sync yields the same set, never duplicates).
- **Investment transactions** — date-range + offset paginated over a 730-day window, upserted on
  the Plaid id (idempotent). Unlike `/transactions/sync`, there's no cursor.
- **Best-effort** — an institution with no investment accounts returns
  `NO_INVESTMENT_ACCOUNTS`/`PRODUCTS_NOT_SUPPORTED`; `PRODUCT_NOT_READY` means "still
  initializing." All are caught and **skipped**, not failed — a webhook re-triggers when ready.

**Performance note (a real fix, not just test tuning):** the sandbox returns **1170** investment
transactions over 730 days. The first implementation upserted them one-by-one — ~1170 network
round-trips over the Supabase pooler, which took *minutes*. The writes are now **batched** into
chunked `$transaction`s (100 upserts per round-trip) and securities are deduped within a run,
turning that into ~12 round-trips. This is the difference between a 14-minute sync and a few
seconds.

### 20.4 Read API

Both guarded, user-scoped, hidden accounts excluded (consistent with net worth):

| Endpoint | Returns |
|---|---|
| `GET /api/investments/holdings` | positions (joined to their security) + portfolio **totals**: `value`, `costBasis`, `gainLoss` (= value − cost basis) |
| `GET /api/investments/transactions` | investment transactions, filter by account/date/type, paginated |

A `holdings` widget id was added to the dashboard config (`DEFAULT_DASHBOARD_CONFIG`, disabled by
default — opt-in).

### 20.5 Proof (live)

`pnpm --filter @fin/api e2e:investments` connected the sandbox item, synced, and proved:

- **13 securities, 13 holdings, 1170 investment transactions** landed; DB counts matched the sync
  result exactly.
- **Totals cross-check**: portfolio `value = 25446.3932` equalled a raw sum of `institution_value`
  to the cent; `gainLoss (24218.7732) = value − costBasis (1227.62)`. First transaction was a real
  Plaid sandbox trade: _"BUY United States Treas Bills…"_.
- **Hidden-account exclusion**: hiding a held account dropped its holdings and lowered the
  portfolio value; unhiding restored it.
- **Idempotency**: a second sync left holdings (13) and investment transactions (1170) unchanged
  (holdings replaced wholesale; transactions upserted). Then it purged cleanly (securities, being
  shared market data, are intentionally left behind for reuse).

## 21. Phase 8 in depth — Plaid Liabilities + Recurring Transactions

Two more Plaid products, built to the same shape as Phase 7 (own module, own sync service, own
background queue, own read API, live E2E). One adds **detail to the debts we already show**; the
other turns transaction history into a **subscriptions/bills view**.

### 21.1 What's connected

The link-token now also requests Liabilities via `required_if_supported_products: [Investments,
Liabilities]` ([plaid.service.ts](../apps/api/src/plaid/plaid.service.ts)) — supporting
institutions grant card/loan detail, others still link. **Recurring transactions need no extra
product** — they're derived from Transactions (which every item already has), so recurring sync
just calls `/transactions/recurring/get`. Two new Plaid calls: `/liabilities/get` and
`/transactions/recurring/get`.

### 21.2 Data model — 2 new tables

- **liabilities** — one row per liability account (`kind` = credit | student | mortgage). Common
  columns that matter across all three (APR/rate, last payment, last statement, **minimum payment**,
  **next due date**, overdue flag); `kind`-specific extras (credit APR breakdown, loan name,
  maturity date, YTD interest/principal…) go in a `details` JSONB. The **outstanding balance itself
  is not duplicated** — it already lives on `Account.currentBalance`; this table is the extra
  metadata. Unique per account; replaced wholesale each sync.
- **recurring_streams** — one row per detected stream. `direction` = inflow | outflow;
  `frequency` (WEEKLY…ANNUALLY), `status`, `is_active`, first/last/`predicted_next_date`, and
  `average`/`last` amounts stored as **positive magnitudes** (`direction` carries the sign — Plaid
  itself signs inflows negative). Unique on Plaid's `stream_id`; replaced wholesale each sync
  (Plaid returns the full current set, active + inactive, every call).

### 21.3 The sync engines

Two background pg-boss jobs, on the `sync-liabilities` and `sync-recurring` queues, each enqueued
on connect ([items.service.ts](../apps/api/src/items/items.service.ts)) and on the relevant
webhook:

- **Liabilities** — [liabilities-sync.service.ts](../apps/api/src/liabilities/liabilities-sync.service.ts):
  fetch `/liabilities/get`, upsert account balances, then **replace** the item's liability rows in
  one atomic `deleteMany`+`createMany`. Webhook: `LIABILITIES` / `DEFAULT_UPDATE`.
- **Recurring** — [recurring-sync.service.ts](../apps/api/src/recurring/recurring-sync.service.ts):
  fetch `/transactions/recurring/get`, map inflow + outflow streams, replace wholesale. Webhook:
  `TRANSACTIONS` / `RECURRING_TRANSACTIONS_UPDATE` (a new code alongside the existing
  `SYNC_UPDATES_AVAILABLE` under the same type).
- **Best-effort** — institutions without liabilities, or items whose transactions aren't ready yet,
  return skippable codes (`NO_LIABILITY_ACCOUNTS`, `PRODUCTS_NOT_SUPPORTED`, `PRODUCT_NOT_READY`)
  that are caught and **skipped**, not failed — a webhook re-triggers when ready.

### 21.4 Read API

Both guarded, user-scoped, hidden accounts excluded (consistent with the rest of the app):

| Endpoint | Returns |
|---|---|
| `GET /api/liabilities` | liabilities (joined to their account for name/balance) + totals: **`totalDebt`** (sum of outstanding balances), **`minimumPaymentDue`** |
| `GET /api/recurring` | streams split into **`inflows`** / **`outflows`**, each with a `monthlyEstimate` (amount normalized to per-month by frequency), + totals `monthlyInflow` / `monthlyOutflow` over active streams. Filters: `activeOnly` (default true), `accountId` |

The `recurring` widget id already existed in `DEFAULT_DASHBOARD_CONFIG` (disabled by default,
opt-in), so no dashboard change was needed for it.

### 21.5 Proof (live)

`pnpm --filter @fin/api e2e:liabilities-recurring` connected the sandbox item, synced transactions
first (recurring depends on them), and proved:

- **3 liability accounts** landed — `credit, mortgage, student` — with `totalDebt = 121974.06`
  cross-checked to the cent against a raw sum of the accounts' balances; `minimumPaymentDue =
  3186.54`.
- **8 recurring streams** (1 inflow, 7 outflows); DB counts matched the sync result; monthly
  run-rate totals computed (`monthlyIn = 4.22`, `monthlyOut = 3771.40`) and non-negative after the
  magnitude fix. `activeOnly` never exceeds the full set.
- **Hidden-account exclusion**: hiding a liability account dropped it from the list and didn't
  increase total debt; unhiding restored it.
- **Idempotency**: a second sync of each left liability (3) and stream (8) counts unchanged (both
  replaced wholesale). Then it purged cleanly.

## 22. Phase 9 in depth — Manual Assets & Liabilities

The first non-Plaid domain: user-entered, off-platform net-worth items (real estate, vehicles,
cash, crypto, or a manual debt) that aren't behind any bank login. Unlike every prior domain,
these rows have no `PlaidItem`/`Account` to hang off of — they're owned directly by `userId`.

### 22.1 Data model — 1 new table

- **manual_assets** — `userId` (direct FK to `Profile`, cascade — the first table scoped this way
  instead of transitively through `Account`), `name`, `kind` (`asset` | `liability`), `category`
  (`real_estate | vehicle | cash | crypto | other_asset | loan | credit_debt | other_liability`),
  `currentValue` (Decimal 20,4), `currency`, `notes`. No sync/replace semantics — this is plain
  user CRUD, not a Plaid-derived snapshot.

### 22.2 API

[manual-assets module](../apps/api/src/manual-assets/): `GET/POST /api/manual-assets`,
`PATCH/DELETE /api/manual-assets/:id`, all guarded, ownership checked via a direct `userId` column
match (not a relation chain). `create()` calls the same `ensureProfile()` upsert
`dashboard.service.ts` uses, since a brand-new user may not have a `Profile` row yet — manual
assets can be the *first* thing a user ever creates, before connecting any bank.

`GET` returns `{ assets, liabilities, totals: { assetsValue, liabilitiesValue, currency } }` —
split by `kind`, not a flat list.

### 22.3 Net worth integration

[aggregations.service.ts](../apps/api/src/aggregations/aggregations.service.ts) `netWorth()` now
sums `ManualAsset` rows (grouped by `kind`) alongside the Plaid account aggregates. **The
historical `series` stays Plaid-accounts-only** — manual entries have no daily snapshot table, so
editing one only shifts *today's* point, not the past. Documented as a deliberate v1 boundary, not
a bug.

### 22.4 Web

New page `/manual-assets` ("Assets & Liabilities" in the sidebar), two sections (Assets /
Liabilities), inline delete-confirm (matching the existing `settings.tsx` pattern), and a dashboard
widget (`manual_assets`, disabled by default). This phase also **introduced Radix Dialog + zod** as
the app's first real "Add/Edit" form pattern (`components/ui/dialog.tsx`,
`components/ui/form-field.tsx`) — both packages were installed but unused before this.

One gap this phase fixed: [app-shell.tsx](../apps/web/src/routes/app-shell.tsx) previously gated
**every** route behind "connect at least one Plaid item first" (`OnboardingRoute`), which made
manual assets unreachable for a user who never connects a bank — directly contradicting the
feature's purpose. `/manual-assets` and `/settings` are now exempt from that gate, and the
onboarding screen links to `/manual-assets` as an explicit alternative path.

### 22.5 Proof (live)

`pnpm --filter @fin/api e2e:manual-assets`: created a manual asset with no `Profile` row yet
(confirmed `ensureProfile()` ran), created a liability, confirmed the list splits by kind with
correct totals, confirmed net worth reflects them exactly with zero Plaid items connected, then
connected a real sandbox item and confirmed net worth shifted by **exactly** the Plaid-only amount
plus the manual net (assets `536541.7405`, liabilities `138994.06`) — an update to the asset's
value shifted net worth by exactly that delta, another user could not read/edit/delete it
(`NotFoundException`), and deleting both reverted net worth to Plaid-only exactly.

Also verified in a real browser (Playwright, session injected via the Supabase Admin API to avoid
the sign-up form's email-domain validation): add/edit dialog, zod catching an invalid amount
inline, cancel-then-confirm delete, and the onboarding-gate fix — all with zero console errors.

## 23. Phase 10 in depth — Budgets

A single recurring monthly limit per Plaid personal-finance-category primary value — no per-month
history table. "This month's actual spend" is never stored; it's computed on every read from
`AggregationsService.spendingByCategory()`, the same method the Spending page already uses.

### 23.1 Data model — 1 new table

- **budgets** — `userId` (direct FK, like `manual_assets`), `category` (validated against
  `PLAID_PRIMARY_CATEGORIES` in `@fin/shared` — Plaid's 17 fixed PFC primary values), `monthlyLimit`,
  `currency`. `@@unique([userId, category])` — one budget per category per user, upserted by
  category rather than a generated id.

### 23.2 API

[budgets module](../apps/api/src/budgets/): imports `AggregationsModule` and calls
`spendingByCategory()` directly rather than re-deriving spend — `BudgetsService.list()` merges the
user's `Budget` rows with that month's category totals into `{category, monthlyLimit, spent,
remaining, percentUsed}`. `PUT /api/budgets/:category` upserts by category (create-or-replace, no
separate create/update split); `DELETE /api/budgets/:category` removes one. `GET
/api/budgets?month=YYYY-MM` defaults to the current calendar month.

### 23.3 Web

New page `/budgets`, per-category progress bars (green under 80%, amber 80–100%, red over), and a
dashboard widget. The "Set a budget" dialog only offers categories that actually represent spend —
`INCOME` and `TRANSFER_IN` are excluded from the picker (`BUDGETABLE_CATEGORIES` in
[lib/schemas/budget.ts](../apps/web/src/lib/schemas/budget.ts)), since `spendingByCategory()` only
sums outflow (`amount > 0`) and a budget on a pure-inflow category would always read "$0 spent" —
caught during browser verification, not designed in upfront.

**A real bug this phase surfaced and fixed:** `PLAID_PRIMARY_CATEGORIES` was the first runtime
(non-type) value ever imported from `@fin/shared` into `apps/web` — every prior shared import was
either a TypeScript type/interface (erased at compile time) or a value nobody had actually
imported yet. Vite serves a workspace-linked package's build as-is over `/@fs/` without running it
through the CJS→ESM interop it normally applies via esbuild's dependency pre-bundler, so the named
export silently failed to resolve at runtime (blank page, `does not provide an export named
'PLAID_PRIMARY_CATEGORIES'`) — this would have broken on **any** real value import from `@fin/shared`,
not just this one. Fixed by adding `@fin/shared` to `optimizeDeps.include` in
[vite.config.ts](../apps/web/vite.config.ts), forcing it through the pre-bundler. This was a
pre-existing gap in the frontend's setup, not a regression.

### 23.4 Proof (live)

`pnpm --filter @fin/api e2e:budgets`: connected a sandbox item, synced real transactions, budgeted
the largest spend category at 2x its actual spend, and confirmed `spent` matched the raw
aggregation exactly, `remaining = limit - spent`, and `percentUsed ≈ 50%`; a second category with no
spend showed `spent = 0`; re-upserting the same category updated the limit in place (no duplicate
row); deleting both left an empty list.

Also verified in a real browser against a seeded user with real synced sandbox transactions: set a
budget, edited its limit, watched the progress bar respond — zero console errors after the Vite fix
above.

## 24. Phase 11 in depth — Transaction Notes, Tags, Category Overrides & Splits

The highest-risk phase of the four (§9–12) — the only one touching the existing Plaid sync hot
path. The whole design turns on one guarantee, confirmed by reading the code before writing any of
it: `sync.service.ts`'s `applyChanges()` builds its upsert `update` payload exclusively from
`mapPlaidTransaction()`'s narrow `TransactionRecord` return shape (`accountId,
plaidTransactionId, amount, currency, date, authorizedDate, name, merchantName, pending,
pfcPrimary, pfcDetailed, paymentChannel`). Prisma's `update` only touches keys present in that
object — so any column **not added to that mapper** is structurally immune to being clobbered by a
resync. New user-edit fields therefore live on two child tables, never on `Transaction` itself.

### 24.1 Data model — 2 new tables

- **transaction_details** — 1:1 (`@unique transactionId`), created lazily on first edit: `note`,
  `categoryOverride`, `tags` (native `String[]`, no separate `Tag` table in v1 — ships
  tagging/filtering without building tag rename/autocomplete management; a normalized table is a
  natural follow-up if usage shows the need).
- **transaction_splits** — 1:many, cascade from `Transaction`. The parent's `amount` stays the
  source of truth for the account total; split amounts must sum to it exactly, enforced in
  `TransactionsService` (not a DB constraint — Postgres check constraints can't easily span rows).
  Replaced wholesale on every edit (`deleteMany` + `createMany`), the same idiom
  `liabilities-sync.service.ts` already uses.

**Known limitation, documented not solved:** Plaid's `removed` list does a hard `deleteMany` on
transactions (e.g. a pending transaction posting gets a new `plaidTransactionId`). Because both
child tables cascade-delete with their parent, tags/notes on a pending transaction are lost when it
posts. No existing code in this app solves this for any field today; out of scope for v1.

### 24.2 API

Extended `apps/api/src/transactions/` (no new module — same domain):

| Endpoint | Does |
|---|---|
| `PATCH /transactions/:id` | Upserts `TransactionDetail` — `note`/`categoryOverride`/`tags`, all optional (PATCH semantics: a field absent from the body is untouched, sent as `null` clears it) |
| `PUT /transactions/:id/splits` | Full replacement set; rejects with 400 if amounts don't sum to the transaction's amount |
| `DELETE /transactions/:id/splits` | Clears all splits — back to unsplit |

`toTransactionDto()` now includes `detail`/`splits`; `category.primary` reflects
`detail?.categoryOverride ?? pfcPrimary`. `ListTransactionsQuery.category` matches either the
Plaid category or a user override (`OR` clause) so a category filter still finds a recategorized
transaction; a new `tags` query param (`hasSome`) filters by tag.

`AggregationsService.spendingByCategory()` keeps its `groupBy(pfcPrimary)` for the common case,
then separately fetches only transactions with a category override and moves their amount from the
original Plaid bucket to the override bucket in JS — avoids a raw-SQL rewrite of the whole method
since the override subset is expected to be small. **Splits do not feed this aggregate in v1** — a
split transaction's total still counts under its own single category; that's an explicit scope
boundary, not an oversight.

### 24.3 Web

`routes/transactions.tsx`: clicking a row expands an inline edit panel below it (not a dialog —
in-context edit, not an "Add X" flow) with a note textarea, tag chips, and a category-override
`<select>`. A "Split transaction" action opens the Dialog+zod pattern from Phase 9
(`components/transactions/transaction-row-detail.tsx`): a dynamic list of amount+category rows
with a live "$X left to allocate" / "Fully allocated ✓" indicator, submit disabled until it
balances exactly.

### 24.4 Proof (live)

`pnpm --filter @fin/api e2e:transaction-details`: synced real sandbox transactions, PATCHed a
note/tags/category-override onto one, confirmed the read API and the category/tag filters reflect
it, confirmed `spendingByCategory` moved the amount to the override bucket, **re-ran
`sync.syncItem()` and confirmed the note/tags/override all survived** (the core guarantee), then
confirmed mismatched split amounts are rejected (400), matching amounts are accepted and read back
summing to the original, and clearing removes them.

Also verified in a real browser: expanded a row, saved a note/tag/category override, confirmed it
rendered in the collapsed row (📝 note preview, tag pill, updated category column) and persisted
across a page reload, then split the same transaction 50/50 in the dialog (watched the remaining-
to-allocate indicator update live, submit correctly disabled until balanced) and confirmed via the
API that both split lines persisted — zero console errors throughout.

## 25. Phase 12 in depth — Goals

The simplest and lowest-risk of the four §9–12 phases, closing out the plan. No new aggregation
wiring, no sync-pipeline interaction — a goal's progress is entirely computed on read.

### 25.1 Data model — 1 new table

- **goals** — `userId` (direct FK, like `manual_assets`/`budgets`), `name`, `kind` (`savings` |
  `debt_payoff`), `targetAmount`, `targetDate` (optional), `linkedAccountId` (optional FK ->
  `Account`, **`onDelete: SetNull`** — the one relation in this schema that intentionally survives
  its parent's removal, since a goal shouldn't vanish just because the account backing it gets
  disconnected), `currentAmountOverride` (used only when unlinked).

### 25.2 API

[goals module](../apps/api/src/goals/): standard CRUD (`GET/POST /goals`,
`PATCH/DELETE /goals/:id`), ownership via direct `userId`, `create()`/`update()` reject linking to
an account the caller doesn't own (`assertAccountOwned` — otherwise a user could link a goal to
someone else's account and read their balance through `currentAmount`). `toGoalDto()`
(`goal.dto.ts`) computes `currentAmount`/`progressPercent` from whichever source applies:

- Linked + `savings`: `currentAmount` = the account's live `currentBalance`.
- Linked + `debt_payoff`: `currentAmount` = `targetAmount - currentBalance` (amount **paid down**,
  not the remaining balance — a debt-payoff goal's progress bar should fill up as the balance
  drops).
- Unlinked: `currentAmount` = `currentAmountOverride` (or `0` if never set).

### 25.3 Web

New page `/goals` (card grid, one card per goal, progress bar + target-date line), exempted from
the onboarding gate alongside `/manual-assets` since an unlinked goal needs no Plaid connection.
"Add goal" Dialog+zod form: a kind toggle, target amount/date, and a linked-account `<select>`
(from `useAccounts()`) that conditionally hides the "current amount" field when a link is chosen —
PATCH semantics send an explicit empty string to unlink, matching the `UpdateGoalDto` convention.

### 25.4 Proof (live)

`pnpm --filter @fin/api e2e:goals`: connected a sandbox item, created a savings goal linked to a
real account and confirmed `currentAmount` tracked its live balance exactly; created an unlinked
debt-payoff goal, bumped `currentAmountOverride` twice and confirmed `progressPercent` math each
time; confirmed another user sees zero goals, can't edit this user's goal, and can't link a goal to
an account they don't own; **removed the linked account's Plaid item and confirmed the goal
survived with `linkedAccountId` set to `null`** (SetNull, not cascade-deleted) and its
`currentAmount` correctly fell back to `0`; deleted both goals.

Also verified in a real browser: added a goal linked to a real synced account (progress bar showed
"Goal reached 🎉" past 100%, since the linked balance already exceeded the small test target),
added an unlinked debt-payoff goal at 25%, and confirmed the edit dialog correctly pre-fills a
goal's existing kind/amount/linked-account when reopened — zero console errors.

---

Phases 9–12 close out the "one-stop-shop" plan: manual assets/liabilities, budgets, transaction
notes/tags/splits, and goals. Alerts (rule-based notifications) remain the one explicitly
out-of-scope item from that plan — it needs new notification/email infrastructure this repo
doesn't have yet.

---

## 26. `apps/web` — the frontend

The backend (Phases 1–12) was built and verified entirely against scripted Sandbox E2Es with no
UI. `apps/web` landed afterward in one large commit (`53a0d7f`, 2026-07-09) — a Vite + React SPA
covering the **entire** product surface in one shot, per [DESIGN_HANDOFF.md](./DESIGN_HANDOFF.md).
This section documents what it actually is and records the first full click-through against a
live backend (2026-07-18), which happened after that commit and caught one real bug.

### 26.1 Stack + layout

`@fin/web`, depends on `@fin/shared` via `workspace:*` for the exact DTO types the API returns —
same pattern as `@fin/api`. Vite + **React 19** + TypeScript, **React Router v7**, **TanStack
Query** (server state/caching), **Radix UI** primitives + **Tailwind CSS v4**, **react-plaid-link**
for the Link modal, **@supabase/supabase-js** for auth, **Zod** for form validation, **Recharts**
for the net-worth/cash-flow/spending charts.

```
apps/web/src/
├─ App.tsx                  # BrowserRouter + route table
├─ main.tsx                 # QueryClientProvider + AuthProvider + ToastProvider, StrictMode
├─ routes/                  # one file per page (see §26.2)
├─ components/
│  ├─ dashboard/            # one widget component per WidgetId (§26.3)
│  ├─ layout/                # sidebar.tsx, status-banner.tsx
│  ├─ transactions/           # transaction-row-detail.tsx (expand/edit + split dialog)
│  └─ ui/                     # dialog.tsx (Radix wrapper), form-field.tsx — the shared Add/Edit form kit
├─ hooks/                    # use-plaid-connect.ts, use-reauth.ts
├─ providers/                # auth-provider.tsx (Supabase session), toast-provider.tsx
└─ lib/
   ├─ api.ts, api-error.ts    # fetch wrapper — attaches the Supabase JWT, throws ApiRequestError
   ├─ queries.ts               # every TanStack Query hook (useAccounts, useGoals, …)
   ├─ format.ts                 # formatMoney/formatDate — the only formatting path (Intl.*)
   ├─ supabase.ts, utils.ts
   └─ schemas/                  # zod schemas for the Add/Edit dialogs (budget, goal, manual-asset, split)
```

### 26.2 Routes

| Path | Page | Notes |
|---|---|---|
| `/sign-in` | Supabase email/password sign-in + sign-up | Redirects to `/` once a session exists |
| `/` | Dashboard | Per-user widget config (§26.3); onboarding screen if zero Plaid items |
| `/accounts` | All connected accounts, grouped by institution | Hide/show toggle (no rename UI — §26.5) |
| `/transactions` | Filter/search/paginate; inline expand for notes/tags/category override + split dialog | |
| `/net-worth`, `/spending`, `/cash-flow` | Aggregation pages | Charts via Recharts |
| `/investments` | Holdings + activity tabs | |
| `/liabilities`, `/recurring` | Read-only detail pages | |
| `/manual-assets` | Assets & Liabilities CRUD | Reachable with zero Plaid items |
| `/budgets` | Set/edit monthly limits | Reachable with zero Plaid items only via nav, not gated |
| `/goals` | Add/edit linked or unlinked goals | Reachable with zero Plaid items |
| `/settings` | Dashboard tab (widgets/order/prefs), Connected Accounts tab (refresh/disconnect), Profile tab (sign out) | Reachable with zero Plaid items |

`app-shell.tsx`'s `NO_ITEMS_REQUIRED_PATHS` (`/manual-assets`, `/goals`, `/settings`) is the
onboarding-gate exemption list — every other route redirects to the "Connect your first account"
screen until at least one Plaid item exists.

### 26.3 Dashboard widgets

One component per `WidgetId` (`WIDGET_COMPONENTS` in `routes/dashboard.tsx`), rendered in the
user's configured order: `net_worth`, `accounts`, `spending_by_category`, `recent_transactions`,
`cash_flow`, `holdings`, `liabilities`, `recurring`, `manual_assets`, `budgets`, `goals`. All but
the first four default to disabled (opt-in) per `DEFAULT_DASHBOARD_CONFIG` in `@fin/shared`.

### 26.4 Live browser verification (2026-07-18)

Ran the real app end-to-end against the live Supabase + Plaid Sandbox backend (both dev servers,
`pnpm api:dev` + `pnpm --filter @fin/web dev`) using a confirmed test user minted via the Supabase
Admin API, signed in through the **actual sign-in form** — the same Gotcha-9 pattern, but logging
in through the UI instead of injecting a session, so the sign-in form itself got exercised.

**What was covered:** sign-in, the onboarding gate and its exemption list, manual assets + an
unlinked goal with zero Plaid items connected (proving `ensureProfile()` still runs), all 11
dashboard widgets after enabling them in Settings, accounts (hide/show + net-worth delta), the
transaction detail panel (note/tags/category override) and the split dialog, investments
(holdings + activity), net worth, spending, cash flow, liabilities, recurring, a budget
(set/progress), a goal linked to a real account (live balance tracking, correct `progressPercent`),
and Settings (widget reorder, preferences, Connected Accounts refresh, Profile sign-out) — with a
reload after each persistence-sensitive change to confirm it actually round-tripped through the
API, not just the optimistic cache. Every real number cross-checked exactly against the figures
recorded in the Phase 7/8 E2E proofs (§20.5, §21.5) — same Sandbox item, same data.

One thing that could **not** be automated: the Plaid Link modal itself (an iframe hosted by
Plaid's CDN) didn't respond to the browser-automation tool's synthetic clicks — not an app bug,
a limitation of driving a cross-origin iframe that way. Worked around it by minting a Sandbox
`public_token` directly (same institution/products `sandboxCreatePublicToken()` uses) and posting
it through the real `POST /api/plaid/exchange` endpoint with the signed-in user's actual JWT — so
the exchange, sync-kickoff, and every downstream page still got exercised against real data; only
the Link iframe's own institution-search UI (Plaid's code, not this repo's) went unclicked.

**Bug found and fixed:** `Settings → Dashboard` tab's `toggleWidget`/`moveWidget`
(`routes/settings.tsx`) closed over the `config` value from render time. Toggling several widgets
in quick succession — clicking switch 2 before switch 1's mutation had round-tripped and
re-rendered — meant switch 2's handler still mutated the pre-switch-1 config, silently reverting
switch 1. Reproduced by enabling all 6 disabled widgets in one fast sequence: 5 landed, the last
(Goals) silently stayed off with no error anywhere. Fixed by reading the latest value from the
TanStack Query cache (`queryClient.getQueryData(["dashboard-config"])`) at click time instead of
trusting the closure — verified fixed by re-running the same fast-toggle sequence and confirming
all 6 persisted across a reload.

**Gap noted, not fixed:** the backend's `PATCH /accounts/:id` supports renaming an account
(§17.2), but `routes/accounts.tsx` only wires up the hide/show toggle — there's no rename UI.
Not a regression (nothing broke), just a feature the frontend build never surfaced; flagged here
rather than built silently since it's new scope, not a bug fix.

No other console errors or wrong numbers surfaced. (`FILE_ERROR_NO_SPACE` / "Plaid link-initialize
script embedded more than once" console lines seen during testing are a local Chrome-profile disk
issue and a React `StrictMode` double-effect artifact respectively — neither is an app bug, see
`main.tsx`'s `<StrictMode>` wrapper for the latter.)

Test data (the minted user, its Plaid item, manual asset, goals, and budget) was deleted afterward
via the Supabase Admin API + `prisma.profile.delete` (cascades to everything — Gotcha 9).
`pnpm --filter @fin/api test` stayed green throughout (23/23), confirming the fix didn't touch
anything backend-side.

### 26.5 Known gaps (not bugs)

- **No account rename UI** (§26.4) — backend supports it, frontend doesn't expose it.
- **No committed frontend test suite.** Verification so far has been interactive (Playwright in
  Phases 9–12, browser automation here) — there's no regression net for `apps/web` today.

---

## 27. Phase 13 in depth — go-live hardening (auth guard, prod secrets, CSP, RLS backstop)

Triggered by an explicit ask: go live with real Plaid **Production** data for the owner and
friends, with "top-notch security." Before writing any code, a live audit (not a docs read) of
every service's DB queries, the RLS migrations, crypto/token handling, git history, and the
frontend auth flow found **no IDOR gaps and no leaked secrets** — the findings below are
hardening on top of an already-sound baseline, not bug fixes.

### 27.1 Global default-deny auth guard

`SupabaseJwtGuard` moved from per-controller `@UseGuards` to a global `APP_GUARD`
(`app.module.ts`), with a new `@Public()` decorator (`auth/public.decorator.ts`) exempting
exactly `GET /health` and `POST /plaid/webhook`. `scripts/hardening-e2e.ts` step 2b enumerates
one route per controller and asserts every non-public one 401s with no token — a regression
test for exactly the class of bug this closes (a future controller shipping without an auth
annotation).

### 27.2 Fail-fast production secrets

`config/env.validation.ts` deliberately leaves every secret optional so local dev/CI boot
without them. `bootstrap.ts`'s new `assertProductionSecrets()` throws at boot — before
`app.listen()` — if `NODE_ENV=production` and any of `DATABASE_URL, DIRECT_URL, SUPABASE_URL,
SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, PLAID_CLIENT_ID, PLAID_SECRET, ENCRYPTION_KEY,
CORS_ORIGINS` is missing — turning a silent misconfiguration into a failed deploy instead of an
opaque 500 on a real user's first Plaid link.

### 27.3 Frontend CSP

`apps/web/vercel.json` gained a `headers` block: a `Content-Security-Policy` allow-listing
`cdn.plaid.com` (Link's iframe/script), `*.supabase.co` (auth), and the API origin, plus
`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`. Mitigates XSS-driven session-token
theft, since Supabase's SDK stores the session in `localStorage` by default. Needs live
verification post-deploy (Vercel headers don't apply to local `vite dev`) — watch the console for
CSP violations through sign-in (incl. Google OAuth) and Plaid Link.

### 27.4 RLS as a real backstop — `FORCE ROW LEVEL SECURITY` + `app_runtime`

The Phase 6 RLS policies only ever applied to Supabase's `authenticated`/`anon` roles; the API
connects as the table **owner**, which bypasses RLS regardless of policy. Phase 13 makes RLS
apply to the API's own connection too, for the part of the app where it matters most.

**New Postgres role `app_runtime`** (migrations `…_phase13_force_rls_app_runtime` and
`…_phase13b_app_runtime_grant`): non-owner, `NOBYPASSRLS`, `LOGIN` with no password set yet (safe
— unusable over the network until deliberately provisioned at deploy time). Every user-scoped
table gets `FORCE ROW LEVEL SECURITY` plus an `app_runtime`-scoped policy covering all of
SELECT/INSERT/UPDATE/DELETE, keyed on `current_setting('app.user_id', true)::uuid` — reusing the
exact ownership-chain joins the `authenticated` policies already had. `securities` and
`webhook_events` get unrestricted `app_runtime` policies (not user-scoped data).

**How the GUC gets set:** `PrismaService.withUserContext(userId, fn)`
(`prisma/prisma.service.ts`) opens one transaction, runs `set_config('app.user_id', userId,
true)`, then runs `fn` inside it. Every model-delegate property and `$transaction`/`$queryRaw`/
`$executeRaw` are monkey-patched in the constructor to transparently redirect to that transaction
via an `AsyncLocalStorage` (`prisma/prisma-context.ts`) whenever one is open — so every existing
`this.prisma.x.y(...)` call site across all 16 services works completely unchanged.
`UserContextInterceptor` (`auth/user-context.interceptor.ts`, a global `APP_INTERCEPTOR` running
right after the auth guard) wraps every HTTP request this way automatically.

**A real bug this surfaced, not just designed around:** wrapping an entire unit of work in one
Postgres transaction is only safe if nothing inside it does slow external I/O. The first version
of this wrapped the *whole* pg-boss sync jobs (which call Plaid, then write) in one transaction —
live testing (`e2e:sync`, then `e2e:goals`) hit real `PrismaClientKnownRequestError`s: a
transaction-not-found error (Prisma's default 5s transaction timeout expiring mid-Plaid-call) and
twice a genuine Postgres `deadlock detected` (40P01) between overlapping syncs of the same item —
exactly the concurrent-access scenario this app's own idempotency tests deliberately exercise
(§16.3). The fix: background jobs and any HTTP path that calls Plaid don't get RLS-wrapped at
all.

**`PrismaOwnerService`** (`prisma/prisma-owner.service.ts`) is a second, separately-connected
Prisma client (via `DIRECT_URL`, the owner role) for exactly those call sites:
- `SyncService`, `InvestmentsSyncService`, `LiabilitiesSyncService`, `RecurringSyncService`,
  `SnapshotService` — all pg-boss background jobs (`QueueService` documents why in full: one
  server-resolved `itemId` at a time, not arbitrary user input, so RLS buys much less there).
- `ItemsService` (link-token, exchange, refresh, remove) — every method calls Plaid, and each
  already scopes its own queries by `userId` explicitly (`requireItem`) before doing so.
  `ItemsController`/`PlaidLinkController` are marked `@SkipUserContext()`
  (`auth/skip-user-context.decorator.ts`) to opt out of the interceptor.
- `PlaidWebhookController` — resolves `PlaidItem` by Plaid's own `item_id` before any `userId` is
  known, which is the definition of a not-yet-user-scoped lookup.

Everything else — accounts, transactions, aggregations, dashboard, investments, liabilities,
recurring, manual-assets, budgets, goals — is pure DB read/write with no external calls, so it
keeps the full `withUserContext` / FORCE RLS treatment. This is also where user-supplied query
input actually drives lookups (filters, ids, pagination), which is where IDOR risk concentrates —
so the split lands the strongest defense-in-depth exactly where it matters most.

**Proof (live, `pnpm --filter @fin/api e2e:rls`, extended):** `app_runtime` with no `app.user_id`
set sees **zero** rows on a FORCE-RLS table; scoped to user A it sees only A's account; an UPDATE
aimed at user B's account while scoped to A affects **zero** rows and leaves B's row unmodified;
the encrypted token column *is* readable once correctly scoped (unlike `authenticated`, which
never gets that column). The full existing E2E suite (sandbox, sync, read, dashboard, hardening,
investments, liabilities-recurring, manual-assets, budgets, transaction-details, goals) was
re-run and stayed green after every change in this phase.

**Cutover is a deploy-time step**, not automatic — `DATABASE_URL` still points at the owner role
locally and will until the production deploy explicitly provisions `app_runtime`'s password and
switches to it. See [SECURITY.md](./SECURITY.md) → "Go-to-production checklist."

### 27.5 A pre-existing race, found but not caused by this phase

While testing Phase 13, `e2e:goals` hit a `deadlock detected` on `items.removeItem`'s cascading
delete, unrelated to the RLS changes (confirmed: `ItemsService` was already on the owner
connection at that point, same as before Phase 13, and the deadlock reproduced then cleared on a
bare retry — a timing-dependent race, not a deterministic regression). Root cause: several
pg-boss jobs enqueued together at connect time (sync, investments, liabilities, recurring) can
still be actively writing an item's child rows when a near-simultaneous item removal cascades
through those same rows. Documented here as a known, pre-existing reliability gap in the sync
engine's handling of concurrent deletes — out of scope for this security-focused phase, not
silently ignored.

### 27.6 Other small fixes bundled with this phase

- `render.yaml`'s `PLAID_ENV` was hardcoded to `sandbox` — changed to `sync: false` so a real
  go-live deploy can't silently keep hitting Plaid Sandbox; also added `SENTRY_DSN` as a required
  `sync: false` var (previously commented out / deferred).
- Full git-history secret scan confirmed clean — no `.env` or credential has ever been committed,
  at any point, in this repo's history.
