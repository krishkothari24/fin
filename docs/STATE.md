# fin-dashboard — Technical State of the Application

_Snapshot as of 2026-07-07 · Phases 1–5 complete (Phase 5 not yet committed)_

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

The build is organized into 6 phases. We have finished 5 of them.

| Phase | Scope | Status |
|------:|-------|--------|
| **1** | Foundation: monorepo, NestJS app, Prisma schema + migration, env validation, auth guard, health check | ✅ **done** |
| **2** | Plaid Link + Item lifecycle: connect an institution, encrypt & store the token, list / refresh / remove | ✅ **done, verified live** |
| **3** | Sync pipeline: webhooks + `/transactions/sync` + background jobs (pull actual transactions) | ✅ **done, verified live** |
| **4** | Read & aggregation API: accounts, transactions, net worth, spending, cash flow | ✅ **done, verified live** |
| **5** | Dashboard config + daily balance snapshots (net-worth-over-time) | ✅ **done, verified live** |
| 6 | Hardening: RLS policies, rate limiting, logging, Sentry, request Plaid Production | ⏭️ **next** |

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

**What does _not_ exist yet (Phase 6 — hardening):** Postgres **RLS** policies (the second
isolation layer), rate limiting, structured logging + Sentry, wiring real **Supabase login**,
and requesting Plaid **Production** access. Also un-tested end-to-end: real webhook *delivery*
(needs a public URL/tunnel — §16.6).

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
   verifies the `Authorization: Bearer <token>` JWT that Supabase issues at login, using
   `SUPABASE_JWT_SECRET` (HS256, via `jose`). On success it sets `req.user = { id, email }`.
   The `id` is the Supabase user's UUID — the same value that keys `profiles`. Any controller
   touching user data is annotated `@UseGuards(SupabaseJwtGuard)`, and reads the user via the
   `@CurrentUser()` decorator.

3. **Per-user isolation, layer 1 (application).** Every query is scoped by `userId`. E.g.
   `requireItem(userId, itemId)` does `findFirst({ where: { id: itemId, userId } })` — so
   asking for someone else's item id returns "not found," never their data.

4. **Per-user isolation, layer 2 (database RLS) — planned Phase 6.** Postgres Row-Level
   Security will be the backstop: even if application code had a bug, the database itself would
   refuse cross-user reads. Not enabled yet.

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

**Not built (Phase 6):** no new endpoints — hardening only (RLS, rate limiting, logging).

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
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase Auth (wired later for real login) |
| `SUPABASE_JWT_SECRET` | verifies user login JWTs (used by the guard now) |
| `PLAID_ENV` | `sandbox` today, `production` at launch |
| `PLAID_CLIENT_ID`, `PLAID_SECRET` | Plaid API credentials |
| `PLAID_WEBHOOK_URL` | public HTTPS URL Plaid posts webhooks to (Phase 3; a tunnel in dev) |
| `ENCRYPTION_KEY` | 32-byte base64 key for token encryption — `openssl rand -base64 32` |

---

## 14. What's next (Phase 6 — hardening & prod readiness)

The feature build is done (Phases 1–5). Phase 6 is about making it safe to expose:

1. **Postgres RLS** policies on every user table — the second isolation layer behind the
   app-level `userId` scoping (§9). Test with two users.
2. **Rate limiting** (e.g. `@nestjs/throttler`) and **structured logging** + **Sentry**.
3. Wire **real Supabase login** (the `SUPABASE_*` keys) so JWTs come from actual sign-ups.
4. **Webhook delivery** end-to-end: point `PLAID_WEBHOOK_URL` at a tunnel/deploy and verify a
   real `SYNC_UPDATES_AVAILABLE` round-trip (§16.6).
5. Request **Plaid Production** access; deploy the web service + worker (e.g. Render).

Fast-follows after that: Plaid Recurring Transactions, Investments, Liabilities.

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
  level. Our planned second isolation layer.
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
