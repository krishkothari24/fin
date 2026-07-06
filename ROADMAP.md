# Personal Finance Advisor — phased roadmap

Two products sharing one guardrail core:
- **Local execution engine** — per-person Claude Code + gate, trades your own
  account inside code-enforced caps. Stays local for now.
- **Hosted read-only advisor** — friends log in for briefs, research, and
  spending analysis. Read-only; no trades on the server. Ships first, lower risk.

**Decided (2026-07):** hosted app is read-only now; execution stays
local/per-person; architect so hosted execution can be added later without a
rewrite. Hosted execution is gated behind a legal + security review.

Phases are ordered so each ships value on its own. Do them top-to-bottom unless
noted. `[x]` = done, `[ ]` = todo. See [HANDOFF.md](HANDOFF.md) for original
decisions, [CLAUDE.md](CLAUDE.md) for operating rules.

---

## Phase 0 — Lock the foundation  (housekeeping, no risk)
Get the repo into a clean, reusable state before building on it.
- [x] Flatten `elite-trading/*` to repo root so hook + `gate.py` paths resolve.
- [x] Gitignore personal state (config.yaml, KILLSWITCH, logs, context/, .env).
- [x] Create the `context/` CSV bridge folder.
- [x] **T0.1** Commit the restructuring as one clean commit.
- [x] **T0.2** Extract guardrail decision logic into a pure
      `guardrails/core.py` — `decide(...) -> Decision(verdict, reason, notional,
      ledger)` — with `gate.py` as a thin Claude Code-hook adapter. Verified
      byte-identical behavior end-to-end.
- [x] **T0.3** `guardrails/test_core.py` — 13 scenarios, dependency-free
      (`python3 guardrails/test_core.py` or pytest). All green.

## Phase 1 — Spending advisor MVP (CSV)  ← highest value, zero infra
Answer "what drove my spending?" against a real statement, today.
- [x] **T1.1** Normalized schema (`date, merchant, amount, category, account`,
      spend-positive) — defined in `advisor/analyze.py`; same shape Plaid emits.
- [x] **T1.2** `spending-advisor` skill + `advisor/` package (deterministic
      Decimal math; LLM only narrates). Isolated: no trading tools in context.
      Modular: `schema` / `categories` / `parsing` / `aggregate` / `analyze`
      (CLI) + `test_advisor`.
- [x] **T1.3** Verified against `advisor/sample-statement.csv` (synthetic).
      TODO: run against a real statement once you drop one in `context/`.
- [x] **T1.4** Analyzer emits: total/net, by_category, top_merchants (×15),
      recurring_candidates, date_range. TODO refinements: month-over-month
      deltas (needs 2+ statements), refund-net-per-category, merchant-name
      cleanup for a few noisy cases.

## Phase 2 — Local execution engine, live
Finish the trading gate and prove it end-to-end with a tiny real account.
- [ ] **T2.1** Fix the hook matcher for the local MCP prefix
      (`claude mcp add robinhood-trading` → `mcp__robinhood-trading__*`).
- [ ] **T2.2** Prove the hook fires with a deliberately-blocked test trade
      before any real money.
- [~] **T2.3** Gate hardening (code-only, done where possible without live MCP):
      - [x] Inline-YAML allowlist footgun fixed — `config.py` parses inline lists
            (was silently failing open). Covered by `test_config.py`.
      - [x] Market orders code-blocked by default (`allow_market_orders: false`)
            in `core.py`; `stop_market` too. Covered by `test_core.py`.
      - [x] Split adapter I/O into `config.py` / `ledger.py` / `audit.py`;
            `gate.py` is now just paths + wiring.
      - [ ] Ledger meters attempts-not-fills — needs the live order-result schema
            to reconcile; deferred to Phase 2 live work (PostToolUse refund on
            rejected orders). Current behavior is fail-safe (over-counts).
      - [ ] Options unsupported in gate (no symbol / notional ×100) — keep
            `allow_options: false`; revisit only if enabling options.
- [ ] **T2.4** Get real cap values from user; create `guardrails/config.yaml`.
- [ ] **T2.5** Connect Robinhood MCP; open + fund a small dedicated Agentic
      account.
- [ ] **T2.6** Live-fire: blocked order → confirm block + log; one tiny real
      trade → confirm fill + ledger; kill-switch test.
- [ ] **T2.7** Exercise the loop: morning-brief → personas → trade-execution
      (simulate-first, limits only); tune skill prompts.

## Phase 3 — Plaid automation  (replaces manual CSV)
Live, always-fresh transactions feeding the same schema from Phase 1.
- [ ] **T3.1** Create the Plaid app (user has 1 dev account); pick products
      (transactions) + environment.
- [ ] **T3.2** Scaffold + test against MOCK data using Plaid's Local MCP (AI
      toolkit) — no real accounts yet. (Neither Plaid MCP returns real
      transactions; Link + `/transactions/sync` is the actual pipe.)
- [ ] **T3.3** Build the Link flow to connect real accounts once; exchange
      public token → access_token; store in `.env` / vault (never committed).
- [ ] **T3.4** `/transactions/sync` pull → normalize into the Phase-1 schema →
      write to `context/` (local) so the advisor is unchanged downstream.

## Phase 4 — Hosted app foundations  (big build; decisions FIRST)
Stand up the multi-tenant shell. Scope this before writing code.
- [ ] **T4.1** Choose the stack: web framework, hosting, auth provider
      (Clerk/Auth0/Supabase). Decision doc first.
- [ ] **T4.2** Build the per-user token vault (the "gateway"): encrypted at
      rest, per-user Plaid Items + read-only brokerage creds. The custody
      boundary.
- [ ] **T4.3** Call the Anthropic API server-side (not Claude Code), with strict
      per-user context isolation so no one sees another's data.
- [ ] **T4.4** Login + connect-accounts onboarding for friends.

## Phase 5 — Port research + spending to the hosted app
- [ ] **T5.1** Run morning-brief + personas server-side, per user.
- [ ] **T5.2** Run the spending advisor server-side, per user, over their vault
      data.
- [ ] **T5.3** Multi-user isolation + read-only guarantees verified.

## Phase 6 — Hosted execution  (LATER, gated — do not start without these)
- [ ] **T6.1** Legal review: adviser / broker-dealer exposure of executing in
      others' accounts from your platform.
- [ ] **T6.2** Security review: custody of trade authority + bank tokens.
- [ ] **T6.3** Add a server-middleware adapter over `guardrails/core.py` — same
      caps, different transport. Only after T6.1 + T6.2 pass.

## Backlog (independent, any time)
- [ ] Persona backtesting / eval against past briefs before trusting
      auto-execute.
- [ ] Package the local engine for friends who want their own execution copy.
