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
