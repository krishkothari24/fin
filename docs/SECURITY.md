# Security & Production Readiness

_Companion to [STATE.md](./STATE.md). Covers the Phase 6 hardening: what protects
the app today, the exact threat each control addresses, and the remaining
human-in-the-loop steps before a public launch._

## Trust model in one paragraph

Clients never talk to Postgres. They talk to the **NestJS API**, which is the
only thing holding a database connection (as the Supabase pooler **owner** role)
and the only thing holding Plaid `access_token`s (encrypted). Every user-scoped
route is behind `SupabaseJwtGuard` (verifies the Supabase JWT → `userId`) and
every query is filtered by that `userId` in the service layer. So the **primary**
authorization gate is the API. Everything below is defense-in-depth around it.

## Controls in place (Phase 6)

| Control | Threat it addresses | Where |
|---|---|---|
| **AES-256-GCM** token encryption at rest | DB dump / backup leak exposes bank tokens | `crypto/` |
| **Supabase JWT** verification per request | unauthenticated access to user data | `auth/supabase-jwt.guard.ts` |
| **Service-layer authz** (`user_id` scoping) | user A reading user B's data via the API | every `*.service.ts` |
| **Postgres RLS** (this phase) | direct DB access via the Supabase `anon`/`authenticated` keys | migration `…_phase6_rls` |
| **Webhook signature verify** (ES256 JWT) | forged Plaid webhooks | `sync/webhook-verification.service.ts` |
| **Rate limiting** (per-IP, `@nestjs/throttler`) | brute force / abuse / accidental floods | `app.module.ts`, `@Throttle`/`@SkipThrottle` |
| **helmet** headers, `x-powered-by` stripped | clickjacking, MIME sniffing, fingerprinting | `bootstrap.ts` |
| **Sanitizing exception filter** | leaking stack traces / SQL / Prisma internals | `observability/all-exceptions.filter.ts` |
| **CORS allowlist** | hostile browser origins calling the API | `bootstrap.ts` (opt-in via `CORS_ORIGINS`) |
| **Structured logs + request ids** | no audit trail / uncorrelated errors | `observability/*` |
| **Sentry** (gated on `SENTRY_DSN`) | errors going unnoticed in prod | `observability/error-reporter.ts` |

## What RLS does and does not do here

The API connects as the table **owner**, and an owner **bypasses RLS** unless a
table is set to `FORCE ROW LEVEL SECURITY`. We deliberately do **not** force it,
so RLS does not change the app's behavior (verified: the owner still reads
everything; the read/aggregation E2Es pass unchanged).

**What RLS protects:** any *direct* database access through the Supabase
`authenticated` / `anon` roles (PostgREST, `supabase-js`, a leaked anon key).
Under those roles:

- a signed-in user can `SELECT` **only their own** rows (policies key on
  `auth.uid()`, joined through `plaid_items → accounts` for the child tables),
- **no** `INSERT/UPDATE/DELETE` is possible (no write grants) — writes are
  API-only,
- the encrypted `access_token_ciphertext` column is **not** granted, so it is
  never selectable even by its owner via that path,
- `webhook_events` (a system table) is invisible entirely.

The same pattern extends to the Phase 7 investments tables (migration
`…_phase7_investments`): `holdings` and `investment_transactions` are user-scoped
(join through `accounts → plaid_items`); `securities` is public market data and is
RLS-enabled with **no** grant/policy, so it's invisible to `authenticated` like
`webhook_events` (the API joins it in server-side).

All of this is asserted live by `pnpm --filter @fin/api e2e:rls`, which impersonates
the `authenticated` role for a second user and proves it cannot see the first
user's accounts, items, transactions, tokens, or the webhook log.

**What RLS does NOT do here:** it is *not* a backstop against an authorization
bug in an API service, because the API (owner) bypasses it. If we want that too,
the upgrade path is: add `ALTER TABLE … FORCE ROW LEVEL SECURITY;` to each user
table, run app queries as a **non-owner** role, and `SET LOCAL app.user_id = <uid>`
(inside a transaction) at the start of each request with policies keyed on
`current_setting('app.user_id')`. That doubles round-trips per query and needs a
per-request transaction, so it is a conscious future trade, not a default.

## Secrets handling

- All secrets live in `apps/api/.env` (gitignored) or the host's secret store.
  **Never** commit them or paste them in chat. `.env.example` documents the keys.
- `ENCRYPTION_KEY`, `PLAID_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`,
  `SUPABASE_JWT_SECRET`, and the DB URLs are the sensitive set.
- Plaid `access_token`s are only ever stored encrypted and never sent to a client.

## Go-to-production checklist (human-in-the-loop — not automatable here)

These need your accounts/infra and are intentionally left as manual steps:

1. **Request Plaid Production access** (dashboard → Production). Sandbox → Production
   only changes `PLAID_ENV` + keys; the code is environment-agnostic.
2. **Public webhook URL** — set `PLAID_WEBHOOK_URL` to a reachable HTTPS endpoint.
   For local end-to-end webhook delivery use a tunnel (e.g. `cloudflared` /
   `ngrok`) pointed at `/api/plaid/webhook`; in prod it's the deployed URL.
3. **Deploy** the API as a persistent Node service (Render/Railway/Fly) — it needs
   a long-running process for pg-boss workers + webhooks, not serverless. Set
   `TRUST_PROXY=1`, `NODE_ENV=production`, `CORS_ORIGINS=<web app origin>`, and all
   secrets in the host env.
4. **Turn on Sentry** — create a project, set `SENTRY_DSN`.
5. **Rotate** any secret ever exposed; confirm least-privilege DB credentials.
6. **Privacy** — publish a privacy policy (financial PII). You never touch bank
   credentials (Plaid Link does), so this is not PCI scope, but treat balances /
   transactions as sensitive personal data.

## Verifying the hardening

```bash
pnpm --filter @fin/api e2e:hardening   # headers, sanitized errors, 429 rate limit, skip-throttle
pnpm --filter @fin/api e2e:rls         # two-user DB-level isolation via the authenticated role
```

Both require the dev-shell DB sandbox to be disabled (they open real Supabase
connections).
