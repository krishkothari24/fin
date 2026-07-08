# TODO / Backlog

Running list of things to do later. Add freely — newest ideas at the bottom of a
section is fine. See [docs/STATE.md](docs/STATE.md) for what already exists and
[docs/SECURITY.md](docs/SECURITY.md) for the go-live checklist.

## Frontend (`apps/web`)

- [ ] **Use Intl formatters.** Format all money/dates/numbers on the frontend with
      `Intl.NumberFormat` / `Intl.DateTimeFormat` — never hand-rolled. Money crosses
      the wire as strings and each user has a `currency` in their dashboard config,
      so format with that currency + the user's locale (e.g.
      `new Intl.NumberFormat(locale, { style: "currency", currency }).format(Number(amount))`).
      One shared `formatMoney` / `formatDate` helper, used everywhere.

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

## Backend / data

- (add ideas here)

## Ops / launch

- See [docs/SECURITY.md](docs/SECURITY.md) → "Go-to-production checklist" (Plaid
  Production, webhook URL/tunnel, Sentry DSN, Render deploy).
