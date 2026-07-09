# fin-dashboard — Frontend Design Handoff

_For: Claude Design (or any design/build tool producing `apps/web`) · Source of truth as of
2026-07-07, Phase 8 backend · Companion docs: [STATE.md](./STATE.md) (backend internals),
[SECURITY.md](./SECURITY.md) (threat model)_

This document specifies **everything the UI needs to be correct against the real backend**:
every endpoint, every response shape, the sign/formatting conventions that are easy to get
backwards, and the screens the product needs. Treat the API contracts here as ground truth —
if anything looks ambiguous, prefer what's written here over inventing a shape.

---

## 1. What this product is

A **multi-tenant, read-only financial dashboard**. A user signs in, connects bank / credit /
investment accounts via **Plaid**, and sees an aggregated view of their finances: net worth,
account balances, transactions, spending by category, cash flow, investment holdings,
liabilities (card/loan detail), and recurring subscriptions/bills.

Three constraints shape every screen — do not design around or against them:

- **Read-only.** No trade execution, no money movement, no "pay this bill" buttons. This is a
  viewer, not a bank.
- **No AI / no ML / no user-defined categories.** Every category, account type, and recurring
  stream comes pre-computed from Plaid. There is no "recategorize this transaction" or
  "create a budget rule" UI to design — those features don't exist in this product.
- **Multi-tenant.** Every screen is scoped to the signed-in user; there is no cross-user or
  admin view.

The backend (NestJS + Postgres/Supabase + Plaid) is complete through Phase 8. **There is no
frontend yet** — `apps/web` doesn't exist. This handoff is what starts it.

---

## 2. Users & core job

Single persona: an individual who has linked their own accounts and wants a fast, trustworthy
read on "where do I stand and what's happening with my money." They check net worth and recent
activity often (daily/weekly), and dig into a specific area (spending, a card's due date,
holdings) less often. Design for a **glanceable home dashboard** plus **focused detail pages**,
not a single dense spreadsheet-like view.

---

## 3. Recommended frontend stack

The repo is a pnpm workspace (`apps/*`, `packages/*`). The frontend should live at `apps/web`
as `@fin/web`, and depend on `@fin/shared` via `workspace:*` for **exact** DTO types — the same
package the API is built from. Do not hand-copy types; import them.

| Concern | Recommendation | Why |
|---|---|---|
| Framework | **Vite + React 18 + TypeScript** | Pure client SPA behind auth — no SSR/SEO need (every page requires a login). Simpler than Next.js for this shape of app. |
| Routing | **React Router v7** | Standard, data-router APIs pair well with TanStack Query loaders |
| Styling | **Tailwind CSS v4** | Per the ask; utility-first, pairs with a headless component layer |
| Components | **shadcn/ui (Radix primitives)** | Copy-in components you own and can theme, not a black-box library — good fit for a design tool to iterate on |
| Server state | **TanStack Query** | Caching, polling (needed for post-connect sync status), background refetch |
| Tables | **TanStack Table** | Transactions / investment transactions need sort, filter, paginate |
| Charts | **Recharts** | Net worth line, spending breakdown, cash flow bars — composable, styles via Tailwind tokens |
| Plaid Link | **react-plaid-link** | Official wrapper for the Link modal (§10) |
| Auth client | **@supabase/supabase-js** | Issues the JWT the API's `SupabaseJwtGuard` verifies (§5) |
| Forms/validation | **Zod** | Already the validation library on the backend; reuse the mental model |
| Dates | **date-fns** | Formatting `YYYY-MM-DD` params and display dates |

These are defaults, not mandates — if Claude Design has strong conventions of its own (e.g. a
different component kit), the **data contracts and screens below are what must be preserved**,
not this table.

---

## 4. Money, dates, and sign conventions — read this before designing any number

Get any of these backwards and every figure on the dashboard is wrong or inverted:

1. **Every money field is a `string`, never a `number`.** The DB stores `DECIMAL(20,4)` and it
   crosses the wire as a string to avoid float precision loss. **Never `parseFloat` and do
   math in JS.** For display, convert with `Number(value)` only at the final formatting step —
   never for calculation, comparison, or accumulation in the frontend (all totals/sums the UI
   needs are already computed server-side).
2. **Format money with `Intl.NumberFormat`, never hand-rolled.** Use the user's
   `DashboardConfig.currency` (§9) and browser locale:
   ```ts
   new Intl.NumberFormat(locale, { style: "currency", currency }).format(Number(amount))
   ```
   Same for dates — `Intl.DateTimeFormat`, not manual string slicing. One shared
   `formatMoney(amount, currency)` / `formatDate(iso)` helper, used everywhere. (This is called
   out explicitly in the backend's own TODO.md — it's a known requirement, not a suggestion.)
3. **Plaid's sign convention on `TransactionDto.amount`: positive = money OUT.** A positive
   amount is spending; negative is income/refund. This is the opposite of how many people
   intuitively read "positive number." Design transaction rows so the sign is reinforced
   visually (e.g. a leading `−` and a different color for inflows), not just a bare number.
4. **`InvestmentTransactionDto.amount` follows the same convention** — positive = cash out of
   the account (e.g. a buy).
5. **`RecurringStreamDto.averageAmount` / `lastAmount` are stored as positive magnitudes** — the
   `direction` field (`"inflow" | "outflow"`) carries the sign, not the number itself. Don't
   apply the transaction sign rule here; use `direction` to decide color/icon.
6. **Two unrelated "hide" concepts — don't conflate them:**
   - `AccountDto.isHidden` — a real, persisted account setting (`PATCH /accounts/:id`). Hidden
     accounts are **excluded from every aggregation** the API computes (net worth, spending,
     cash flow, holdings totals, liability totals). This is a data-affecting toggle.
   - `DashboardConfig.hiddenAccountIds` — a separate list inside the dashboard config JSON. It's
     a **purely visual** "collapse this account card on my dashboard" preference and does **not**
     change any totals. Design these as two distinct controls (e.g. "Hide from totals" vs.
     "Hide this card") so users don't confuse them.
7. **Dates are ISO strings** (`YYYY-MM-DD` for transaction/liability dates, full ISO timestamp
   for `asOf`/`createdAt`-style fields). Query params that accept a date range use `YYYY-MM-DD`
   exactly — the API 400s on anything else (`Matches(/^\d{4}-\d{2}-\d{2}$/)`).

---

## 5. Auth & session model

The API has **no login endpoint of its own** — it only verifies a JWT that **Supabase Auth**
issues. The frontend owns the login/signup UI via `@supabase/supabase-js`; the API's
`SupabaseJwtGuard` just checks the `Authorization: Bearer <token>` header (ES256, verified
against Supabase's JWKS endpoint) and rejects with `401 Unauthorized` if it's missing, expired, or
invalid.

Implications for the UI:

- Every authenticated request needs `Authorization: Bearer <supabase-session-access-token>`.
  Use the Supabase client's session (it handles refresh) and attach the token in your API
  client/fetch wrapper.
- A `401` response anywhere should trigger a redirect to the sign-in screen (session expired),
  not an inline error toast.
- `GET /api/health` is the only unauthenticated route — useful for an initial "is the API up"
  check, but not required for normal flows.
- **What Supabase Auth method to expose (email/password vs. magic link vs. OAuth) is an open
  product decision**, not fixed by the backend — the backend only cares that a valid Supabase
  JWT arrives. Default recommendation: email + password, since it's the simplest to design and
  test end-to-end.

---

## 6. API fundamentals

- **Base path:** everything is prefixed `/api` (e.g. `https://<host>/api/accounts`).
- **Auth:** every route below requires the bearer JWT (§5) unless noted.
- **Content type:** JSON in, JSON out.
- **Error envelope — identical shape for every failure**, so build one error-handling path:
  ```ts
  interface ApiError {
    statusCode: number;
    error: string;          // e.g. "Unauthorized", "Bad Request", "Internal Server Error"
    message: string | string[]; // class-validator returns an array of messages on 400s
    requestId?: string;     // surface this in a "something went wrong" screen for support
    path: string;
  }
  ```
  Unexpected server errors (500) always return the generic message `"Something went wrong.
  Please try again."` — never a stack trace or DB detail. Design a generic error state that
  shows this message + `requestId`, not the raw error.
- **Rate limiting:** global default **120 requests / 60s per IP** (`429` past budget, standard
  error envelope). `POST /plaid/link-token` and `POST /plaid/exchange` are tighter — **15/60s** —
  because they call Plaid. Design a lightweight "please wait a moment and retry" toast for 429s
  on the Plaid-connect flow specifically (it's the one a user could plausibly hit by
  double-clicking "Connect another account").
- **Query validation is strict.** Unknown query params are rejected (`forbidNonWhitelisted`).
  Only send the params documented below.
- **Pagination is offset-based** (`limit`/`offset`), not cursor-based, for every paginated list
  endpoint (`transactions`, `investments/transactions`). Max `limit` is 200; default 50.

---

## 7. Data contracts (`@fin/shared`)

Import these from `@fin/shared` — do not redeclare them. Reproduced here for reference:

```ts
export type ItemStatus = "good" | "login_required" | "error";
export type AccountType = "depository" | "credit" | "loan" | "investment" | "other";
export const LIABILITY_TYPES: AccountType[] = ["credit", "loan"]; // credit+loan are liabilities; depository+investment are assets

export interface AccountDto {
  id: string;
  name: string;
  officialName: string | null;
  mask: string | null;              // last 4 digits, e.g. "0000"
  type: string;                     // AccountType
  subtype: string | null;           // e.g. "checking", "401k", "credit card"
  currentBalance: string | null;    // money as string — see §4
  availableBalance: string | null;
  currency: string | null;
  isHidden: boolean;                // excluded from aggregations when true — see §4.6
  institutionName: string | null;
  // NOTE: no institution logo/color field exists yet. Design account rows to work with
  // a generated fallback (initials/color from institutionName), not an <img>.
}

export interface TransactionDto {
  id: string;
  accountId: string;
  amount: string;                   // positive = money OUT — see §4.3
  currency: string | null;
  date: string;                     // ISO date YYYY-MM-DD
  name: string;
  merchantName: string | null;
  pending: boolean;
  category: { primary: string | null; detailed: string | null }; // Plaid's own category, not user-editable
}

export interface NetWorthDto {
  asOf: string;
  assets: string;
  liabilities: string;
  netWorth: string;                 // assets - liabilities
  currency: string;
  series?: Array<{ date: string; netWorth: string }>; // only present when ?series=true
}

export interface CategorySpendDto {
  category: string;
  amount: string;
}

/** One month of cash flow. net = income - outflow (both non-negative numbers). */
export interface CashFlowPointDto {
  month: string;                    // "YYYY-MM"
  income: string;
  outflow: string;
  net: string;
}

export interface TransactionsPage {
  transactions: TransactionDto[];
  total: number;
  limit: number;
  offset: number;
}

// --- Investments ---

export interface SecurityDto {
  id: string;
  tickerSymbol: string | null;
  name: string | null;
  type: string | null;
  closePrice: string | null;
  currency: string | null;
}

export interface HoldingDto {
  id: string;
  accountId: string;
  security: SecurityDto;
  quantity: string;
  institutionPrice: string | null;
  value: string | null;             // market value
  costBasis: string | null;
  gainLoss: string | null;          // value - costBasis, when both known — color-code +/-
  currency: string | null;
}

export interface HoldingsResponse {
  holdings: HoldingDto[];
  totals: { value: string; costBasis: string; gainLoss: string; currency: string };
}

export interface InvestmentTransactionDto {
  id: string;
  accountId: string;
  security: { tickerSymbol: string | null; name: string | null } | null;
  type: string;                     // buy | sell | cash | fee | transfer | cancel
  subtype: string | null;
  quantity: string | null;
  amount: string;                   // positive = cash OUT — see §4.4
  price: string | null;
  fees: string | null;
  date: string;
  name: string;
  currency: string | null;
}

export interface InvestmentTransactionsPage {
  transactions: InvestmentTransactionDto[];
  total: number;
  limit: number;
  offset: number;
}

// --- Liabilities ---

export type LiabilityKind = "credit" | "student" | "mortgage";

export interface LiabilityDto {
  id: string;
  accountId: string;
  accountName: string;
  mask: string | null;
  kind: LiabilityKind;
  currentBalance: string | null;    // outstanding balance (from the account)
  aprPercentage: string | null;     // credit: purchase APR
  lastPaymentAmount: string | null;
  lastPaymentDate: string | null;
  lastStatementBalance: string | null;
  lastStatementIssueDate: string | null;
  minimumPaymentAmount: string | null;
  nextPaymentDueDate: string | null;
  isOverdue: boolean | null;        // surface prominently — this is a "pay attention" state
  currency: string | null;
}

export interface LiabilitiesResponse {
  liabilities: LiabilityDto[];
  totals: { totalDebt: string; minimumPaymentDue: string; currency: string };
}

// --- Recurring ---

export type RecurringDirection = "inflow" | "outflow";
export type RecurringFrequency = "UNKNOWN" | "WEEKLY" | "BIWEEKLY" | "SEMI_MONTHLY" | "MONTHLY" | "ANNUALLY";

export interface RecurringStreamDto {
  id: string;
  accountId: string;
  direction: RecurringDirection;
  description: string;
  merchantName: string | null;
  category: string | null;
  frequency: RecurringFrequency | string;
  status: string;
  isActive: boolean;
  firstDate: string;
  lastDate: string;
  predictedNextDate: string | null; // good candidate for "next charge" UI
  averageAmount: string | null;     // positive magnitude — see §4.5
  lastAmount: string | null;
  monthlyEstimate: string | null;   // pre-normalized to per-month — use this for run-rate totals, not averageAmount
  currency: string | null;
}

export interface RecurringResponse {
  inflows: RecurringStreamDto[];
  outflows: RecurringStreamDto[];
  totals: { monthlyInflow: string; monthlyOutflow: string; currency: string };
}

// --- Dashboard config ---

export type WidgetId =
  | "net_worth" | "accounts" | "spending_by_category" | "recent_transactions"
  | "cash_flow" | "holdings" | "liabilities" | "recurring";

export const WIDGET_IDS: WidgetId[]; // runtime array of the above, for validation

export interface DashboardConfig {
  widgets: Array<{ id: WidgetId; enabled: boolean; order: number }>;
  hiddenAccountIds: string[];       // visual only — see §4.6
  defaultRangeDays: number;         // 1-365
  currency: string;                 // 3-char ISO code, e.g. "USD"
}

export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig; // see §9 for the actual default order
```

---

## 8. Endpoint reference

All paths relative to `/api`. Auth = Supabase JWT bearer unless noted.

### Plaid Link & item lifecycle

| Method & path | Purpose | Request | Response |
|---|---|---|---|
| `POST /plaid/link-token` | Start a **new** connection | — | `{ linkToken: string; expiration: string }` |
| `POST /plaid/exchange` | Finish connecting after Plaid Link succeeds | `{ publicToken: string }` | `{ itemId: string; institutionName: string \| null; accountsConnected: number }` |
| `GET /items` | List connected institutions | — | `Array<{ id: string; institutionName: string \| null; status: ItemStatus; lastSyncedAt: string \| null; accounts: number }>` |
| `POST /items/:id/reauth-token` | Get an **update-mode** link token to fix `login_required` | — | `{ linkToken: string; expiration: string }` |
| `POST /items/:id/refresh` | Re-pull balances for one item | — | `{ refreshed: number }` |
| `DELETE /items/:id` | Disconnect an institution (cascades: purges its accounts/transactions/etc.) | — | `{ removed: true }` |

> `lastSyncedAt` is `null` until the first background sync completes — see §11, this is the
> signal for a "still fetching your data" state right after connecting.

### Accounts

| Method & path | Purpose | Query/Body | Response |
|---|---|---|---|
| `GET /accounts` | List all accounts across all items | — | `AccountDto[]` |
| `PATCH /accounts/:id` | Hide/show or rename one account | `{ isHidden?: boolean; name?: string }` (both optional, name 1–100 chars) | updated `AccountDto` |

### Transactions

| Method & path | Query params (all optional) | Response |
|---|---|---|
| `GET /transactions` | `startDate`, `endDate` (`YYYY-MM-DD`), `accountId` (UUID), `category` (matches `pfc_primary`), `search` (substring, case-insensitive, matches name/merchant), `pending` (bool), `limit` (1–200, default 50), `offset` (default 0) | `TransactionsPage` |

### Aggregations

| Method & path | Query params | Response |
|---|---|---|
| `GET /aggregations/net-worth` | `series` (bool, default false) — adds the daily timeseries | `NetWorthDto` |
| `GET /aggregations/spending` | `startDate`, `endDate` (`YYYY-MM-DD`, optional) | `CategorySpendDto[]`, largest first |
| `GET /aggregations/cash-flow` | `startDate`, `endDate` (optional) | `CashFlowPointDto[]`, chronological |

### Dashboard config

| Method & path | Body | Response |
|---|---|---|
| `GET /dashboard/config` | — | `DashboardConfig` (returns `DEFAULT_DASHBOARD_CONFIG` if the user has none saved) |
| `PUT /dashboard/config` | full `DashboardConfig` object (validated: every widget id must be a known `WidgetId`, `hiddenAccountIds` must be UUIDs, `defaultRangeDays` 1–365, `currency` exactly 3 chars) | saved `DashboardConfig` |

### Investments

| Method & path | Query params | Response |
|---|---|---|
| `GET /investments/holdings` | — | `HoldingsResponse` |
| `GET /investments/transactions` | `startDate`, `endDate`, `accountId`, `type` (buy/sell/cash/fee/transfer/cancel), `limit` (1–200, default 50), `offset` | `InvestmentTransactionsPage` |

### Liabilities

| Method & path | Response |
|---|---|
| `GET /liabilities` | `LiabilitiesResponse` |

### Recurring

| Method & path | Query params | Response |
|---|---|---|
| `GET /recurring` | `activeOnly` (bool, default **true**), `accountId` (UUID) | `RecurringResponse` |

---

## 9. The dashboard config system — this defines the home screen

`GET/PUT /dashboard/config` is not a settings footnote — it **is** the architecture of the home
dashboard. The home screen should render a **grid/list of widget cards**, one per enabled entry
in `config.widgets`, in `order`. A "Customize dashboard" screen lets the user toggle
`enabled` and reorder (drag-and-drop reordering is a natural fit, writing back `order` as
0..N on drop) — plus edit `defaultRangeDays` and `currency`.

Default config (what a brand-new user sees — 5 widgets on, 3 opt-in):

| `id` | Default | Suggested widget content | Full detail page |
|---|---|---|---|
| `net_worth` | **on** | current net worth number + small trend sparkline (from `?series=true`) | Net Worth page (§12) |
| `accounts` | **on** | account cards/list with balances, grouped by institution | Accounts page |
| `spending_by_category` | **on** | top categories, small bar/donut, current period | Spending page |
| `recent_transactions` | **on** | last 5–10 transactions | Transactions page |
| `cash_flow` | **on** | last few months income vs. outflow, mini bar chart | Cash Flow page |
| `holdings` | off (opt-in) | portfolio value + gain/loss, top positions | Investments page |
| `liabilities` | off (opt-in) | total debt, next due date/amount, overdue flag if any | Liabilities page |
| `recurring` | off (opt-in) | monthly run-rate (in vs out), next few upcoming charges | Recurring page |

Investments/liabilities/recurring default **off** because not every user has those account
types — design the "Customize dashboard" screen so turning one on is an easy, discoverable
action (e.g. surface a one-time nudge if the user has liability/investment accounts but the
matching widget is off).

`defaultRangeDays` is the fallback lookback window for pages that accept a date range
(Transactions, Spending, Cash Flow) when the user hasn't picked a custom range in that session.

---

## 10. Plaid Link integration flow

Two flows, both driven by `react-plaid-link`:

**Connecting a new institution:**
```
1. UI calls POST /plaid/link-token          → { linkToken }
2. Open Plaid Link with that linkToken (usePlaidLink hook)
3. User picks their bank + logs in *inside Plaid's UI* — the app never sees bank credentials
4. Plaid Link's onSuccess gives the frontend a public_token
5. UI calls POST /plaid/exchange { publicToken }  → { itemId, institutionName, accountsConnected }
6. Show a success state, then transition to the "syncing" state (§11) — data isn't there yet
```

**Re-authenticating a broken connection** (an item shows `status: "login_required"`, e.g. the
user changed their bank password):
```
1. UI calls POST /items/:id/reauth-token    → { linkToken }
2. Open Plaid Link in *update mode* with that token — Plaid shows only that institution's re-login
3. onSuccess needs no exchange call; the item's status resolves on the next sync
```

Design an explicit, persistent banner/badge for any item with `status !== "good"` — a
`login_required` item silently produces **stale** balances/transactions, which is worse than an
obvious error state. Surface it on the Accounts page and, ideally, as a global banner.

---

## 11. Async sync — the "your data isn't here yet" state

Connecting an account does **not** synchronously populate transactions, holdings, liabilities,
or recurring streams — `POST /plaid/exchange` kicks off **background jobs** (pg-boss queues) and
returns immediately with just an account count. There is no push/websocket notification when a
sync finishes.

Design implication: right after a successful connect (or any time `GET /items` shows an item
with `lastSyncedAt: null`), show a **"We're fetching your data — this can take a moment"** state
on the affected widgets/pages rather than treating an empty transactions list as "no
transactions." A reasonable approach: poll `GET /items` every few seconds until every item has a
non-null `lastSyncedAt`, then refetch the relevant queries (TanStack Query's `refetchInterval`
fits this well). Investments/liabilities/recurring sync independently of the base transaction
sync, so a "fully synced" state may need to consider more than just `lastSyncedAt` on the item —
at minimum, don't block the whole UI on it; let each widget resolve its own loading/empty/data
state independently.

---

## 12. Screens (information architecture)

Primary nav (sidebar, typical dashboard layout):

1. **Dashboard** (home) — the widget grid from §9.
2. **Accounts** — every connected account, grouped by institution; hide/show + rename; item
   status badges; "Connect another account" CTA (§10); reauth CTA on broken items.
3. **Transactions** — full filterable/paginated table (`GET /transactions`): date range,
   account, category, search, pending toggle.
4. **Net Worth** — `NetWorthDto` with `?series=true`: big number + line chart over time, assets
   vs. liabilities breakdown.
5. **Spending** — `CategorySpendDto[]` for a selectable date range: bar or donut chart +
   ranked list.
6. **Cash Flow** — `CashFlowPointDto[]`: grouped/stacked bar chart, income vs. outflow per
   month, net line.
7. **Investments** — two tabs:
   - *Holdings*: `HoldingsResponse` — portfolio totals header (value / cost basis / gain-loss,
     color-coded) + positions table.
   - *Activity*: `InvestmentTransactionsPage` — filterable/paginated table (mirrors
     Transactions).
8. **Liabilities** — `LiabilitiesResponse`: totals header (total debt, minimum payment due) +
   cards/rows per liability showing APR, last payment, next due date, overdue flag.
9. **Recurring** — `RecurringResponse`: inflows/outflows split, monthly run-rate totals, list of
   streams with next predicted date, `activeOnly` toggle.
10. **Settings**
    - *Dashboard*: the widget on/off + reorder + `defaultRangeDays` + `currency` editor (§9),
      saved via `PUT /dashboard/config`.
    - *Connected accounts*: same data as the Accounts page but framed as connection management
      (list items, reauth, disconnect/remove with a confirmation — removal is destructive and
      cascades).
    - *Profile*: sign out; whatever minimal account info Supabase Auth exposes.

Plus non-nav screens: **Sign in / Sign up** (§5), and an **onboarding empty state** — a user
with zero items should land on a focused "Connect your first account" screen instead of an
empty dashboard grid.

---

## 13. States & edge cases to design for

- **Zero accounts connected** — onboarding CTA, not an empty grid (§12).
- **Item `login_required` / `error`** — persistent, unmissable banner + one-click reauth (§10).
- **Post-connect syncing** — "fetching your data" state, not false-empty (§11).
- **Empty-but-synced** (e.g. no transactions in the selected range, no liabilities because the
  user has no credit/loan accounts) — a calm empty state, distinct from the syncing state.
- **Pending transactions** — `TransactionDto.pending: true` — visually distinguish (e.g. muted/
  italic + "Pending" tag); they can still change or disappear.
- **Overdue liability** — `isOverdue: true` — should stand out (color/icon), it's the one thing
  on this dashboard closest to "actionable."
- **Rate limited (429)** on the connect flow — brief retry message, not a hard failure (§6).
- **401 anywhere** — redirect to sign-in, don't render a broken authenticated page.
- **Unexpected 500** — generic message + `requestId` from the error envelope (§6); never surface
  raw error text.
- **Hidden account** — indicate in the Accounts list which accounts are excluded from totals
  (`isHidden`) vs. just visually collapsed on the dashboard (`hiddenAccountIds`) — see §4.6.
- **Large numbers / negative net worth** — net worth can legitimately be negative (more debt
  than assets); don't design a layout that assumes it's always positive.

---

## 14. Visual & interaction direction

- **Tone:** calm, trustworthy, data-forward fintech — think Mercury/Ramp/Copilot Money more than
  a consumer budgeting app. Generous whitespace, restrained color, no gamification.
- **Numbers:** tabular figures (`font-variant-numeric: tabular-nums`) for anything in a column
  so digits align. Right-align monetary columns in tables.
- **Color semantics:** pick one consistent pair for "good/inflow/gain" vs. "bad/outflow/loss"
  (e.g. green/red, or a colorblind-safer teal/amber) and use it identically across net worth
  deltas, transaction direction, cash flow, and investment gain/loss — do not invent a different
  scheme per page. Reserve the alert color (likely a distinct red/orange) for `isOverdue` and
  `login_required`, separate from the routine "spending" color, so genuine problems don't blend
  into normal outflow styling.
- **Charts needed:** net worth line/area over time; category breakdown (bar or donut); cash
  flow grouped/stacked bars with a net line/marker; optionally a small gain/loss indicator per
  holding. Keep chart chrome minimal — these support glanceable reading, not exploration
  tooling.
- **Density:** the Dashboard is glanceable (cards/summaries); detail pages (Transactions,
  Investments → Activity) are dense, sortable tables. Don't force table density onto the
  dashboard widgets.
- **Responsiveness:** must work down to a single-column mobile layout — this is a "check my
  balance on my phone" product as much as a desktop one.
- **Empty/loading states:** skeleton loaders that mirror final layout (not spinners) for
  widgets/tables; the syncing and onboarding states (§11, §13) need real designed states, not a
  generic spinner.

---

## 15. Explicit non-goals (guardrails)

Do not design UI for any of the following — they're out of scope by product constraint, not by
oversight:

- Trade execution, transfers, bill pay, or any "move money" action.
- Manual transaction categorization, custom categories, or budget/goal creation.
- Any AI/assistant surface ("ask AI about your spending," auto-generated insights) — all
  numbers here are deterministic aggregation Plaid already computed.
- Multi-account/family/shared views — strictly one user, one private dashboard.
- An admin or cross-user view of any kind.

---

## 16. Open decisions (for whoever builds `apps/web`, not blocking design)

- Exact Supabase Auth method (email/password vs. magic link vs. OAuth) — §5.
- Whether widget reordering on Settings is drag-and-drop or simple up/down controls.
- Whether Investments "Holdings" and "Activity" are tabs on one route or two separate nav items.
- Light/dark mode — not specified by the backend either way; the DTOs are theme-agnostic.
