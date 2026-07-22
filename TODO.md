# TODO / Backlog

Running list of things to do later. Add freely — newest ideas at the bottom of a
section is fine. See [docs/STATE.md](docs/STATE.md) for what already exists and
[docs/SECURITY.md](docs/SECURITY.md) for the go-live checklist.

## Frontend (`apps/web`)

- [x] **Use Intl formatters.** Done — `formatMoney`/`formatDate` in
      [apps/web/src/lib/format.ts](apps/web/src/lib/format.ts) use
      `Intl.NumberFormat`/`Intl.DateTimeFormat` and are the only formatting path used
      across routes/widgets.
- [x] **Google OAuth sign-in** — ✅ done and verified live. "Continue with Google"
      button in [apps/web/src/routes/sign-in.tsx](apps/web/src/routes/sign-in.tsx)
      alongside the existing email/password form (kept, not replaced). Calls
      `supabase.auth.signInWithOAuth({ provider: "google" })`, redirects back to
      `/sign-in` which already bounces to `/` once a session exists — no new route
      needed. No backend/schema changes (JWT guard + `ensureProfile()` are
      provider-agnostic). Google Cloud OAuth client + Supabase provider config
      done 2026-07-19 — confirmed in-browser that clicking the button correctly
      redirects to Google's real account picker scoped to the project's Supabase
      callback URL (stopped short of completing an actual login, since that grants
      a real OAuth session on your Google account — full click-through login is
      yours to do whenever).

## Product / Plaid

- [x] **Investments** — ✅ done (Phase 7). Plaid Investments product enabled:
      holdings (positions, securities, cost basis, gain/loss) + investment
      transactions, with `GET /investments/holdings` and `/investments/transactions`.
      See [docs/STATE.md](docs/STATE.md) §20.
- [x] **Liabilities** — ✅ done (Phase 8). Plaid Liabilities product enabled:
      credit/student/mortgage detail (APR, statement/due dates, minimum payment),
      with `GET /liabilities`. See [docs/STATE.md](docs/STATE.md) §21.
- [x] **Recurring Transactions** — ✅ done (Phase 8). Plaid's recurring streams →
      inflow/outflow subscriptions view with monthly run-rate, `GET /recurring`.
      See [docs/STATE.md](docs/STATE.md) §21.
- [x] **Manual Assets & Liabilities** — ✅ done (Phase 9). User-entered off-platform
      net worth (real estate, vehicles, cash, crypto, manual debts), included in
      `netWorth()`, `GET/POST/PATCH/DELETE /manual-assets`. See
      [docs/STATE.md](docs/STATE.md) §22.
- [x] **Budgets** — ✅ done (Phase 10). Monthly spend limit per Plaid category vs.
      actual spend, `GET /budgets`, `PUT/DELETE /budgets/:category`. See
      [docs/STATE.md](docs/STATE.md) §23.
- [x] **Transaction notes/tags/category overrides/splits** — ✅ done (Phase 11).
      `PATCH /transactions/:id`, `PUT/DELETE /transactions/:id/splits`. See
      [docs/STATE.md](docs/STATE.md) §24.
- [x] **Goals** — ✅ done (Phase 12). Savings-target / debt-payoff tracking,
      optionally linked to a live account balance. `GET/POST /goals`,
      `PATCH/DELETE /goals/:id`. See [docs/STATE.md](docs/STATE.md) §25.
- [ ] **Alerts** — rule-based notifications (balance below X, bill due soon,
      budget over threshold). Deliberately out of scope for phases 9-12; needs
      new notification/email infrastructure this repo doesn't have yet.

## Backend / data

- (add ideas here)

## Ops / launch

- See [docs/SECURITY.md](docs/SECURITY.md) → "Go-to-production checklist" (Plaid
  Production, webhook URL/tunnel, Sentry DSN, Render deploy).
  .env file should just be 1 for backend and front end. look into it.
- [x] **Phase 13 go-live hardening** — ✅ done (2026-07-22). Global default-deny
      auth guard, fail-fast prod secret validation, frontend CSP, and RLS as a
      real backstop (`FORCE ROW LEVEL SECURITY` + non-owner `app_runtime` role,
      live-verified deny-by-default + correct per-user scoping). Full audit
      found no leaked secrets and no IDOR gaps in the existing code. See
      [docs/STATE.md](docs/STATE.md) §27 and
      [docs/SECURITY.md](docs/SECURITY.md).
- [ ] `app_runtime`'s DB password still needs provisioning at deploy time
      (`ALTER ROLE app_runtime WITH PASSWORD '...'`, out-of-band, never in a
      file) and `DATABASE_URL` needs pointing at it for production — see
      SECURITY.md checklist step 2. Local dev stays on the owner role.
- [ ] Known pre-existing flaky race (found during Phase 13 testing, not caused
      by it): concurrent pg-boss sync jobs vs. a near-simultaneous item removal
      can occasionally deadlock (`e2e:goals` step 7, passes on retry). Not
      security-relevant — worth a real fix later. See STATE.md §27.5.

## Roadmap — friends, brokerages, AI trade advisor (assessed 2026-07-19)

End goal: friends can each connect their own bank + brokerage accounts and see a
shared-format (but per-user isolated) dashboard, plus get AI-generated trade ideas
(advisory only — no execution, keeps the app read-only). Full gap-analysis done
2026-07-19; summary + sequencing rationale below, phases are meant to run in order.

**Already done, not a gap:** multi-tenancy (open signup, `userId`-scoped queries,
RLS-verified isolation) and Plaid Investments sync (holdings, cost basis,
gain/loss) — see [docs/STATE.md](docs/STATE.md) §20 and §9/§19.1. Friends can
already sign up and connect their own brokerages today; nothing new needed there.

### Phase A — Go live (blocks real friend usage; ops, not code)

Decided 2026-07-19: **$0/mo to start** — Render free tier for the API (accepts
cold-starts/webhook delay as the tradeoff), free static host for `apps/web`,
existing Supabase free tier. See [render.yaml](render.yaml) (Render Blueprint,
ready to import — `sync: false` env vars still need filling in the dashboard).

- [x] `render.yaml` blueprint written — build `pnpm api:build`, start
      `node apps/api/dist/main.js`, health check `/api/health`, free plan.
      `PLAID_ENV` and `SENTRY_DSN` are now required `sync: false` fills
      (2026-07-22) — the blueprint no longer silently defaults to sandbox or
      skips Sentry.
- [ ] Import `render.yaml` at Render, fill in the `sync: false` secrets
      (`DATABASE_URL` — **app_runtime's** credentials, not the owner's, see
      SECURITY.md checklist step 2 — `DIRECT_URL`, `SUPABASE_*`, `PLAID_*`,
      `ENCRYPTION_KEY`, `CORS_ORIGINS`, `SENTRY_DSN`) — manual, needs your
      actual account/secrets
- [ ] Deploy `apps/web` (static `dist/`) to Vercel or Cloudflare Pages free tier,
      set `VITE_API_BASE_URL` to the Render URL — manual, needs your account
- [ ] Plaid Production access (dashboard app is Sandbox-only today) — manual,
      likely the real cost driver, independent of hosting choice
- [ ] Public `PLAID_WEBHOOK_URL` → deployed Render URL's `/api/plaid/webhook`,
      verify a real `SYNC_UPDATES_AVAILABLE` round-trip
- [ ] Rotate any exposed secrets (git history scan came back clean — nothing
      found to rotate, but re-check anything ever pasted outside `.env`),
      confirm least-privilege DB creds (this is what `app_runtime` is)
- [ ] Publish a privacy policy (real requirement once friends' PII is involved)
- [ ] Turn on Sentry — decided 2026-07-22 to do this now, not defer. Create a
      free Sentry project, set `SENTRY_DSN` (already wired end-to-end, no code
      change needed — see docs/STATE.md §27).
- Explicitly deferred (not needed to start, zero rework to add later): paid
  Supabase tier

### Phase B — Brokerage UI depth (parallelizable with Phase A, low risk)
- [ ] Asset allocation breakdown (by security type/sector), charted
- [ ] Per-brokerage/institution grouping in the holdings table
- [ ] Realized gain/loss (derivable from existing `investment_transactions`)
- [ ] Real-time quotes / options detail — out of scope for Plaid (EOD prices
      only); fold into Phase C's market-data provider instead of a one-off build

### Phase C — AI advisory layer (net-new; biggest lift)
- [ ] Revise CLAUDE.md's "No AI / no ML" constraint to explicitly carve out one
      scoped exception: advisory only, never executes trades
- [ ] Pick a market-data provider for real-time quotes/fundamentals (Plaid
      doesn't provide this) — Polygon.io / Alpaca Market Data / Finnhub / IEX Cloud
- [ ] New `apps/api/src/advisor/` module: assembles read-only context from
      existing services (holdings, transactions, cash flow, net worth), calls
      Claude API with tool-use "skills" (get-quote, get-fundamentals,
      exposure-analysis), returns structured advisory output only
- [ ] Rate limiting / per-user usage caps (LLM calls cost money per query)
- [ ] Frontend route for the advisor (chat or report style)
- [ ] "Not investment advice" disclaimer before this ships to friends

Full detail/rationale: see the plan written 2026-07-19
(`curried-moseying-mist` in Claude Code plan history) if still available, or
regenerate via `/plan` — the summary above is self-contained enough to resume from.
