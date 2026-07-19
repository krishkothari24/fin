# TODO / Backlog

Running list of things to do later. Add freely — newest ideas at the bottom of a
section is fine. See [docs/STATE.md](docs/STATE.md) for what already exists and
[docs/SECURITY.md](docs/SECURITY.md) for the go-live checklist.

## Frontend (`apps/web`)

- [x] **Use Intl formatters.** Done — `formatMoney`/`formatDate` in
      [apps/web/src/lib/format.ts](apps/web/src/lib/format.ts) use
      `Intl.NumberFormat`/`Intl.DateTimeFormat` and are the only formatting path used
      across routes/widgets.

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
- [ ] Plaid Production access (dashboard app is Sandbox-only today)
- [ ] Deploy API as a persistent Node service (pg-boss workers + webhooks need a
      long-running process, not serverless) — Railway is the likely target
- [ ] Deploy `apps/web` pointed at the deployed API
- [ ] Public `PLAID_WEBHOOK_URL`, verify a real `SYNC_UPDATES_AVAILABLE` round-trip
- [ ] Turn on Sentry (`SENTRY_DSN`)
- [ ] Rotate any exposed secrets, confirm least-privilege DB creds
- [ ] Publish a privacy policy (real requirement once friends' PII is involved)

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
