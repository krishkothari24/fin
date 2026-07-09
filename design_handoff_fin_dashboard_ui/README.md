# Handoff: fin — Financial Dashboard UI

## Overview
A multi-tenant, read-only financial dashboard (net worth, accounts, transactions, spending, cash
flow, investments, liabilities, recurring). This bundle covers an **interactive HTML prototype**
of the core screens: Dashboard (home), Accounts, Transactions, Investments, Settings, and the
Sign in / Sign up / Onboarding flow. It also includes the full backend API handoff doc
(`BACKEND_API_HANDOFF.md`) that the prototype was designed against — treat that doc as ground
truth for data shapes, endpoints, and sign/formatting conventions.

## About the Design Files
`prototype.dc.html` is a **design reference** — a working HTML/JS prototype built to show intended
look, layout, and interaction, not production code to copy directly. It uses a proprietary
templating runtime (`<x-dc>`, `<sc-for>`, `<sc-if>`, inline-styled React-ish components) that
does not exist outside this design tool. **Do not try to run or port this file as-is.** The task
is to **recreate these screens in React + Tailwind CSS**, per the stack already recommended in
`BACKEND_API_HANDOFF.md` §3 (Vite + React 18 + TypeScript, React Router v7, Tailwind CSS v4,
shadcn/ui, TanStack Query/Table, Recharts, react-plaid-link, @supabase/supabase-js) — wiring it to
the real API instead of the mock data used here.

You can open `prototype.dc.html` directly in a browser to click through the live prototype, and
read it as source for exact copy, structure, and interaction logic.

## Fidelity
**High-fidelity.** Colors, type sizes/weights, spacing, and copy below are final — recreate
pixel-close using Tailwind utilities (map the hex values to Tailwind theme tokens, don't
eyeball new ones). Layout structure (grid columns, card composition) should match; exact pixel
measurements can flex slightly to fit Tailwind's spacing scale.

## Design System / Visual Language
This prototype does not use a pre-existing design system — build one for this app in Tailwind
(theme tokens below) and apply it consistently, since Claude Code is free to structure the
component layer (shadcn/ui recommended per the backend doc).

**Type:** Inter (Google Font), weights 400/500/600/700/800. No other typefaces.
- Page titles: 20px / 700 / -0.01em tracking
- Section/card labels (eyebrow): 11–12.5px / 600 / uppercase / 0.04em tracking / muted color
- Body/labels: 13–13.5px / 500
- Large numbers (net worth, totals): 22–32px / 700 / -0.02em tracking
- All monetary figures and table numerics: `font-variant-numeric: tabular-nums`, right-aligned in
  table columns.

**Color tokens (dark theme):**
- `bg` app background: `#0a0e16`
- `bg-sidebar`: `#0b0f19`
- `surface` card background: `#121826`
- `surface-hover` / inset rows: `rgba(255,255,255,0.02–0.05)`
- `border-subtle`: `rgba(255,255,255,0.06–0.08)`
- `text-primary`: `#F2F4F8`
- `text-secondary`: `#9AA4B2` / `#C4CBD6` (table body / secondary emphasis)
- `text-muted`: `#7A8394`
- `text-faint`: `#565F70`
- `accent` (primary actions, links, selected nav, focus): `#3B82F6` (hover `#5B93F5`)
- `success` / inflow / gain: `#34D399` (emerald)
- `danger` / outflow / loss: `#F87171` (rose-red)
- `alert` (overdue, login_required — reserved, never reused for routine spend/outflow):
  `#F59E0B` (amber)

Card style throughout: `background:#121826; border:1px solid rgba(255,255,255,0.06);
border-radius:14px` (12px for smaller nested cards), padding ~18–24px. Buttons: solid `#3B82F6`
fill with `#0a0e16` text for primary actions; text-only links in `#3B82F6` for secondary actions;
destructive actions in `#F87171`.

**Logomark:** a filled circle (`#3B82F6`) containing a small rotated-square (diamond) cutout in
the background color — deliberately abstract, not a letter glyph, at 26–30px depending on
context (sidebar vs. sign-in).

## Screens

### 1. App shell (persists across all authenticated screens)
- **Sidebar**, 248px fixed width, `#0b0f19` background, right border `rgba(255,255,255,0.07)`.
  - Logo + wordmark "fin" (700/16px) top.
  - Nav list, vertical, 2px gap, each item 9px/12px padding, 8px border-radius, 13.5px/500 label.
    Active item: highlighted (accent-tinted background + accent text). Items not yet built show a
    small "SOON" pill (9.5px/600, muted, `rgba(255,255,255,0.05)` bg) and are non-interactive.
    Full nav order: Dashboard, Accounts, Transactions, Net Worth*, Spending*, Cash Flow*,
    Investments, Liabilities*, Recurring*, Settings (*= stubbed as "SOON" in the prototype —
    build real screens per `BACKEND_API_HANDOFF.md` §12).
  - Footer: user chip (avatar initials circle + name "Jordan Diaz" + "Signed in" caption).
- **Global status banner**: full-width strip under the top edge of main content, shown whenever
  any connected item has `status !== "good"`. Amber-tinted (`rgba(245,158,11,0.1)` bg, amber left
  text), a 6px dot, message `"{institution} needs to be reconnected — its data may be out of
  date."`, and a solid amber "Reconnect" button that resolves the item back to `good` (in the
  real app: opens Plaid Link in update mode per §10).
- Main content area: 28px/32px padding, vertical scroll, page content fades in (`opacity 0→1,
  translateY 4px→0`, 0.25s ease) on navigation.
- A toast (bottom-right, `#1a2233` bg, 9px radius, fade-in) confirms actions like reconnect,
  disconnect, connect, sign out — auto-dismisses after ~2.6s.

### 2. Dashboard (home)
Widget grid, `grid-template-columns: repeat(auto-fit, minmax(320px,1fr))`, 16px gap. Maps to
`GET /dashboard/config` (§9) — this prototype hardcodes the default-on widget set and order;
production should render dynamically from config.
- **Net Worth** (spans 2 columns): eyebrow label, big number (32px/700), Assets/Liabilities
  sub-figures (14px/600, green/red), and an SVG sparkline (200×64, single accent-blue polyline,
  rounded joins) trending the last 6 data points. Maps to `GET /aggregations/net-worth?series=true`.
- **Accounts**: up to 5 account rows (name, masked last-4, colored initials badge — badge color:
  rose for credit/loan, blue for investment, green for depository), balance right-aligned. "View
  all" link → Accounts screen. Only accounts NOT in `dashboardHidden`/`hiddenAccountIds` show here
  (separate from `isHidden`, see Conventions below).
- **Spending by Category**: ranked list, each row = category label + amount, with a thin
  (6px-tall) horizontal bar scaled to the largest category, in accent blue.
- **Recent Transactions**: last 5, name + date (+ "Pending" amber tag when applicable), amount
  right-aligned colored by direction (see sign convention below).
- **Cash Flow**: 6 months, paired mini bar chart per month (green = income, gray `#565F70` =
  outflow), 110px chart height, legend below.
- **Liabilities** (spans 2 columns): header shows total debt + minimum payment due; each liability
  row shows name + masked account, a due-date caption (amber + dot indicator when overdue, e.g.
  `"Overdue — was due Jun 28"`), and balance. Overdue rows get a subtle amber-tinted row
  background.

### 3. Accounts
Header: page title + "+ Connect another account" primary button (in prod: opens Plaid Link,
§10). Below: one card per connected institution (`GET /items` + `GET /accounts` grouped by
`institutionName`), each with:
- Header row: institution name, a status pill (`CONNECTED` green / `NEEDS ATTENTION` amber /
  `ERROR` amber), and — only when `status === "login_required"` — an amber "Reconnect →" link.
- One row per account: name, subtype tag, masked last-4, balance (right, tabular), and two
  independent controls per account (see Conventions below):
  - A text toggle "Hide on dashboard" / "Show on dashboard" (visual-only collapse,
    `dashboardHidden` / `hiddenAccountIds`).
  - A switch control for "excluded from totals" (`isHidden`, data-affecting per §4.6). When on,
    the row dims to 55% opacity and gets an "Excluded from totals" red-tinted tag next to the
    subtype tag.

### 4. Transactions
Filter bar (flex-wrap row): free-text search (name/merchant), account select, category select,
pending-status select (All / Pending only / Posted only), date-range select (All time / This
week / This month) — maps to `GET /transactions` query params (`search`, `accountId`, `category`,
`pending`, `startDate`/`endDate`, §8). All filters are client-reactive with no submit step.
Below: a table (Date, Description [+ italic amber "Pending" sub-label], Account, Category, Amount
— right-aligned, colored, tabular) inside a card with `overflow-x:auto` so columns never clip at
narrow widths. Empty state (no rows match filters): centered icon placeholder + "No transactions
match your filters" / "Try widening the date range or clearing a filter." Pagination: "Showing
X–Y of N" + Prev/Next buttons (8 rows/page in the prototype; use the real `limit`/`offset` API
pagination, §6, max 200/default 50).

### 5. Investments
Totals header: 3 stat cards (Value / Cost Basis / Gain-Loss, the last colored green/red) from
`HoldingsResponse.totals`. Tab switcher (Holdings / Activity, underline-accent active state).
- **Holdings tab**: table — Ticker (accent blue), Security name, Qty, Price, Value, Cost Basis,
  Gain/Loss (colored, signed with `+`/`−` prefix) — `overflow-x:auto` wrapper, `min-width:660px`
  inner table so columns stay reachable on narrow viewports.
- **Activity tab**: table — Date, Description, Type (buy/sell/cash/fee…), Qty, Amount (colored
  per the investment-transaction sign convention below) — same overflow pattern, `min-width:560px`.

### 6. Settings
Left sub-nav (Dashboard / Connected Accounts / Profile), content column max-width 640px.
- **Dashboard tab**: "Widgets" card — one row per `WidgetId` (label, up/down reorder buttons,
  on/off switch) writing back `order`/`enabled` (maps to `PUT /dashboard/config`, §9). "Preferences"
  card — Default date range select (7/14/30/60/90 days → `defaultRangeDays`) and Currency select
  (USD/EUR/GBP/CAD → `currency`).
- **Connected Accounts tab**: one row per item — name, status pill, account count ("N accounts",
  singular "1 account"), and Reconnect (only if `login_required`) / Refresh / Disconnect links.
  Disconnect shows an inline confirm strip ("Disconnect {name}? This removes its accounts,
  transactions, and history." + Cancel / Disconnect buttons) before actually removing — maps to
  `DELETE /items/:id`, a destructive cascading action per §12. Row layout wraps
  (`flex-wrap: wrap; row-gap`) rather than clipping at narrow widths.
- **Profile tab**: avatar + name + email, and a "Sign out" button (red-tinted) that in this
  prototype routes to the Sign-in screen.

### 7. Sign in / Sign up
Centered single card (max-width 380px) on the bare app background, no sidebar/chrome. Logo +
wordmark above the card. Card: title + subtitle (copy switches between sign-in/sign-up mode),
Email field, Password field (+ Confirm password field only in sign-up mode), primary button
("Sign in" / "Create account"), and a bottom prompt toggling between modes ("Don't have an
account? Sign up" / "Already have an account? Sign in"). Per `BACKEND_API_HANDOFF.md` §5, the
default recommendation is Supabase email/password auth — this screen's fields map directly to
that. Submitting sign-in in the prototype routes to Dashboard; submitting sign-up routes to
Onboarding (simulating a brand-new user).

### 8. Onboarding (empty state)
Centered single column (max-width 460px), no sidebar/chrome — the state a user with zero
connected items should land on instead of an empty dashboard grid (§12/§13). Icon tile (blue
circle, outlined square), heading "Connect your first account", supporting copy, a 3-line
benefit list (read-only / instant net worth+spending+cash flow / connect multiple institutions),
and a primary "Connect an account" button that in production starts the Plaid Link "connecting a
new institution" flow (§10) and should transition into the post-connect syncing state (§11) once
wired to the real API.

## Interactions & Behavior
- All navigation is instant client-side (no route transitions beyond the 0.25s fade-in) — use
  React Router v7 as recommended in the backend doc; each screen above should be its own route.
- Hover states: nav items get a subtle `rgba(255,255,255,0.05)` background; links go to the
  lighter accent hover (`#5B93F5`); buttons follow the same pattern.
- Toggles (account hide/show, widget enable/disable) are optimistic — flip immediately, no
  loading spinner, since these are local prototype-only mutations. In production these are real
  `PATCH`/`PUT` calls (§8) — you likely do want optimistic UI with rollback-on-error via TanStack
  Query.
- Reorder (Settings → Dashboard widgets) uses simple up/down buttons, not drag-and-drop — this
  was an explicit open decision in the backend doc (§16); up/down was chosen for this pass.
  Buttons disable (dim) at the top/bottom of the list.
- Loading/skeleton states, the post-connect "syncing" state (§11), and 401/429/500 error states
  described in the backend doc are **not built** in this prototype — design/implement them in the
  real app per §11 and §13 (skeye that mirror final layout, not spinners).

## Money, Sign, and Data Conventions — read `BACKEND_API_HANDOFF.md` §4 in full
The prototype follows these rules; preserve them exactly when wiring to the real API:
1. Money is formatted with `Intl.NumberFormat(locale, { style: 'currency', currency })` — never
   hand-rolled string concatenation, never `parseFloat` + arithmetic on the raw API string.
2. **Transaction display sign is flipped from the raw API value for readability**: the API's
   `TransactionDto.amount` is positive = money OUT. The UI shows outflows as `−$54.32` in
   `#F87171` and inflows (raw negative amounts) as `+$3,200.00` in `#34D399` — i.e. take
   `Math.abs()` and choose the prefix/color from the sign, don't print the raw signed number.
   Same convention and colors for `InvestmentTransactionDto.amount`.
3. `RecurringStreamDto` amounts are unsigned magnitudes — use the `direction` field
   (`inflow`/`outflow`) for color/sign, not the number's sign (prototype doesn't build Recurring
   yet, but keep this in mind when you do).
4. Two distinct "hide" concepts, both demonstrated in the Accounts screen — do not conflate them:
   `isHidden` (excludes the account from every aggregation server-side) vs. a dashboard-only
   `hiddenAccountIds`-style collapse (purely visual, does not affect totals).
5. `isOverdue` liabilities and `login_required` items both use the reserved amber alert color —
   never the routine green/red used for inflow/outflow or gain/loss.

## Assets
No external image assets. Logomark and all icons are drawn with plain CSS shapes (circles,
squares, rotated squares) — no SVG illustration work to hand off. Font is loaded from Google
Fonts (Inter).

## Files in this bundle
- `prototype.dc.html` — the interactive HTML prototype (open directly in a browser to click
  through it; read as source for exact structure/copy/logic). Not runnable/portable code — see
  "About the Design Files" above.
- `BACKEND_API_HANDOFF.md` — the complete backend API contract (endpoints, DTOs, auth, sync
  model, sign conventions, full information architecture including screens not yet designed here:
  Net Worth, Spending, Cash Flow, Liabilities, Recurring). Required reading before implementation.
