# Elite Trading → Personal Finance Advisor — build roadmap

The project grew from "local trading gate" into **two products sharing one
guardrail core**:

- **Local execution engine** (per-person, Claude Code + gate) — places trades
  in *your own* account, inside code-enforced caps. Stays local for now.
- **Hosted read-only advisor** (multi-user web app) — friends log in for
  morning briefs, persona research, and spending analysis. Read-only:
  no trades execute on the server. Lower legal risk, ships first.

**Decided direction (2026-07):** hosted app is **read-only** now (research +
spending); trade execution stays **local/per-person**. We architect so hosted
execution can be added *later* without a rewrite — see the guardrail-core split
below. Going live with hosted execution needs a legal + security pass first
(broker-dealer / adviser exposure, custody of others' tokens).

See [HANDOFF.md](HANDOFF.md) for original decisions, [CLAUDE.md](CLAUDE.md) for
operating rules.

---

## TRACK A — Local execution engine (the guardrail + trading loop)

### A1 — Make the gate actually FIRE  ← START HERE
- [x] **Nesting resolved** — flattened `elite-trading/*` to repo root; hook path
      + `gate.py` ROOT now resolve correctly.
- [ ] **Extract guardrail core.** Split the decision logic out of `gate.py` into
      a pure `guardrails/core.py` — `decide(order, config, ledger) -> (verdict,
      reason)` — with `gate.py` as a thin Claude Code-hook adapter. This is what
      lets us reuse the exact same rules as server middleware later.
- [ ] **Fix + prove the hook matcher.** Execution is local, so target the
      locally-added MCP prefix (`claude mcp add robinhood-trading` →
      `mcp__robinhood-trading__*`). Prove it fires with a blocked test trade
      before any real money.

### A1b — Gate correctness hardening (code-only, no live account)
- [ ] **Ledger meters attempts, not fills** — debits cap at PreToolUse, before
      the order executes; failed orders still burn the daily cap. Decide: accept,
      or reconcile from actual fills.
- [ ] **YAML footgun** — inline-list config silently disables the allowlist
      (fails OPEN). Harden the parser or hard-fail on unknown shapes.
- [ ] **Market orders not code-blocked**, only prompt-blocked. Enforce in the
      gate if "limits only" is a real invariant.
- [ ] **Options unsupported in gate** (no symbol, notional missing ×100). Keep
      `allow_options: false` or fix before enabling.
- [ ] Commit the 8-scenario test harness so edits are regression-checked.
- [x] **Gitignore personal state** — config.yaml, KILLSWITCH, logs, context/,
      .env all ignored.

### A2 — Personal setup & config
- [ ] Real cap values from the user; create `guardrails/config.yaml`.
- [ ] Connect Robinhood MCP locally; open + fund a small dedicated Agentic
      account.

### A3 — Live-fire safety test
- [ ] Deliberately-blocked order → confirm block + `logs/trades.jsonl` entry.
- [ ] One tiny real end-to-end trade → confirm fill + ledger update.
- [ ] Kill switch test (`touch guardrails/KILLSWITCH`).

### A4 — Exercise the research loop
- [ ] morning-brief → personas → trade-execution (simulate-first, limits only).
- [ ] Tune skill prompts on real output.

---

## TRACK B — Spending advisor (Plaid + statements)  [read-only, isolated]

Separate surface with NO order tools in context (handoff decision #3).

### B1 — CSV bridge  ← works TODAY
- [x] `context/` folder created + gitignored (statements are PII).
- [ ] **Spending-advisor skill** that reads `context/*` and answers
      "what drove my spending?" — categorization, top merchants, trends.
      No trading tools in its context.

### B2 — Plaid automation (user has 1 Plaid dev account)
- [ ] Plaid app setup; Link flow to connect real accounts once.
- [ ] `/transactions/sync` pull → normalize into the same shape the CSV bridge
      uses, written to `context/` (or a DB in the hosted app). Token in `.env` /
      vault, never committed.
- [ ] Use Plaid's Local MCP (AI toolkit) to scaffold + test against MOCK data
      before touching real accounts. (Note: neither Plaid MCP returns real
      transactions — they're dev tooling; Link + /transactions/sync is the pipe.)

---

## TRACK C — Hosted multi-user app (read-only advisor)  [the big build]

Friends log in; each connects their own read-only accounts. Needs its own
scoping pass before starting — framework, hosting, and auth choices are open.

### C1 — Foundations (decisions first, then build)
- [ ] Choose stack: web framework, hosting, auth (Clerk/Auth0/Supabase).
- [ ] **Per-user token vault** (the "gateway"): encrypted at rest, per-user
      Plaid Items + read-only brokerage creds. This is the custody boundary.
- [ ] Anthropic API called **server-side** (not Claude Code); per-user context
      isolation so no one sees another's data.

### C2 — Port the shared research + spending surfaces
- [ ] Morning brief + personas + spending advisor run server-side per user.
- [ ] Reuse `guardrails/core.py` where relevant (read-only, but same discipline).

### C3 — (LATER, gated) Hosted execution
- [ ] Legal review: adviser/broker-dealer exposure of executing in others'
      accounts from your platform.
- [ ] Security review: custody of trade authority + bank tokens.
- [ ] Add server-middleware adapter over `guardrails/core.py` — same caps,
      different transport. Only after the two reviews pass.

---

## Later / independent
- [ ] Persona backtesting / eval against past briefs before trusting
      auto-execute.
- [ ] Packaging the local engine for friends who want their own execution copy.
