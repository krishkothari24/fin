# Handoff — Elite Trading project

Paste this file's path into a new Claude Code session (or just open the repo
in Claude Code — it reads `CLAUDE.md` automatically) to get full context.
This doc is the "why," `CLAUDE.md` is the "how to operate it."

## What this is

A personal trading research + guarded-execution system, built for one person
plus a friend group. Two layers, kept strictly separate:

- **Shared layer** (safe to build once, distribute to everyone): a morning
  news/research agent and two trading personas (long-term, short-term) that
  produce written proposals. Read-only, no money at risk.
- **Per-person layer** (never shared): each person's own Robinhood Agentic
  account connection, their own guardrail config, their own execution.

## Decisions already made — don't relitigate these without asking

1. **Friends get research only, not execution.** Explicitly decided against
   trading in friends' accounts on their behalf — that's regulated activity
   (investment adviser / broker-dealer territory) if one person is steering
   trades that execute in someone else's account. Each friend runs their own
   instance, own MCP auth, own account. See README "Sharing with friends."
2. **Auto-execute is allowed, but only inside code-enforced caps.** The user
   wants tight-limit auto-execution, not full autonomy and not
   approve-every-trade forever. The caps (`guardrails/config.yaml`) are
   enforced by `guardrails/gate.py` via a Claude Code `PreToolUse` hook —
   this is a hard boundary the model cannot reason its way around, by
   design. Do not weaken this into a prompt-only check.
3. **News never touches the trading context raw.** The morning-brief skill
   sanitizes everything into a structured table before any persona reads it,
   specifically to reduce prompt-injection exposure for an agent that has
   order-placement tools nearby. Keep this separation when extending the
   system (e.g. if you add more data sources, sanitize them too).
4. **Limit orders only, simulate before placing.** trade-execution skill
   calls `review_equity_order` before `place_equity_order`. Don't add
   market-order support without deliberately revisiting the gate's notional
   estimation logic (it currently blocks orders it can't price).
5. **Fidelity/Plaid stays read-only.** No execution path planned for
   Plaid-linked accounts. Treat it purely as portfolio context, sanitized
   like everything else before reaching a persona.

## What's built and verified

- `guardrails/gate.py` — tested against 8 scenarios (allow, ticker
  blocklist, ticker allowlist miss, per-trade cap, daily cap, cooldown,
  unpriced market order, options-disabled, kill switch). All passed.
- Four skills: `morning-brief`, `persona-long-term`, `persona-short-term`,
  `trade-execution` — written, not yet run against a live Robinhood MCP
  connection (no live account was connected during this session).
- `.claude/settings.json` hook wiring — matcher is
  `"mcp__robinhood.*"`; **this needs to be checked against the actual
  connected server's tool-name prefix** once Robinhood MCP is added via
  `claude mcp add`, since MCP tool names are namespaced by the server name
  the user chooses at add-time. If the user names it something other than
  `robinhood-trading`, update the matcher and the `ORDER_TOOL_PATTERN` /
  matcher pairing accordingly.

## Not built yet — likely next steps

1. **Live-fire test of the whole loop** against a real (small, capped)
   Robinhood Agentic account: connect MCP, confirm the hook actually fires
   (test with a deliberately-blocked trade first), then a real small trade
   end to end.
2. **Field-name verification** in `guardrails/gate.py`: `estimate_notional()`
   and `extract_symbol()` guess at common field names
   (`symbol`/`ticker`, `quantity`/`shares`, `limit_price`/`price`, etc.).
   Once real Robinhood MCP tool schemas are visible (`/mcp` or tool
   inspection in Claude Code), confirm the actual field names for
   `place_equity_order` and `place_option_order` and adjust the gate if they
   differ.
3. **Plaid/Fidelity integration** — not started. Needs its own scoping pass:
   which accounts, where tokens live, how positions get pulled into
   `briefs/` context. Keep it read-only; don't let it grow an execution path
   later without revisiting decision #5 above.
4. **Packaging for friends** — currently a plain folder. Consider packaging
   as a Cowork/Claude Code plugin (skills + hook + example config bundled)
   so friends install rather than copy-paste. Not done yet.
5. **Persona backtesting / eval** — no historical validation of the persona
   logic has been done. Worth running the personas against past briefs
   before trusting them with auto-execute.

## Open questions for the user (ask before deciding, don't assume)

- Exact starting values for `per_trade_cap_usd` / `daily_cap_usd` /
  `ticker_allowlist` — the example config has placeholder numbers.
- Which Fidelity/other accounts to bring in via Plaid, and whether that's
  worth building before or after the live Robinhood loop is trusted.
- Whether short-term persona should ever get options access (config
  defaults to `allow_options: false`; this was a deliberate default, not a
  limitation of the code).

## File map

See `README.md` for the file table and daily-use commands; see `CLAUDE.md`
for the operating rules a Claude Code session should follow while running
this project day to day.
