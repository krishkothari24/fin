# Elite Trading

A personal trading research and guarded-execution system for Claude Code.
Shared research layer for you and friends; execution is always individual —
each person's own agent, own Robinhood Agentic account, own limits.

Not investment advice. Not a product. You (and each friend) are solely
responsible for trades in your own accounts. Fund the Agentic account only
with money you can afford to lose — this is beta-grade tooling on top of a
beta brokerage feature.

## How it works

```
morning-brief  ──▶  briefs/YYYY-MM-DD.md          (sanitized news, shared)
personas       ──▶  briefs/...-proposals-*.md      (ideas + reasoning)
trade-execution──▶  Robinhood MCP place_order      (limits only)
        ▲
        │  PreToolUse hook: guardrails/gate.py
        │  (per-trade cap, daily cap, allowlist,
        │   cooldown, kill switch — enforced in code)
```

The gate runs before every Robinhood MCP call. Claude cannot skip it,
because Claude Code executes the hook, not the model.

## Setup (each person does this in their own copy)

1. Clone/copy this folder. Open it in Claude Code.
2. `cp guardrails/config.example.yaml guardrails/config.yaml` and edit
   your caps and ticker lists. Start small.
3. Connect Robinhood:
   `claude mcp add robinhood-trading --transport http https://agent.robinhood.com/mcp/trading`
   then `/mcp` → authenticate (desktop only; you'll bounce between the
   browser and the Robinhood mobile app, and open + fund a dedicated
   Agentic account — your regular account is never touched).
4. Sanity-test the gate without risking a fill:
   ask Claude to place a limit buy far below market for a ticker NOT on
   your allowlist → it must be blocked, and the block must appear in
   `logs/trades.jsonl`. Then try an allowed ticker over your per-trade
   cap → also blocked. Only then trade for real.
5. Recommended ramp: weeks 1-2 proposals-only (don't run trade-execution),
   weeks 3-4 approve every trade manually, then auto-execute within caps
   if you still like what you see.

## Daily use

- "Run the morning routine" → brief + proposals, then decide.
- "Execute today's proposals" → trade-execution pipeline (simulate first,
  limits only, gate enforced, everything logged).
- Emergency stop: `touch guardrails/KILLSWITCH` (blocks all orders
  instantly). Remove the file to resume. Disconnecting the MCP in `/mcp`
  is the nuclear option.

## Sharing with friends

Share the repo (skills + gate + example config). Each friend:
- runs their own Claude Code, their own MCP auth, their own Agentic
  account, their own config.yaml.
- Do NOT share configs with real caps, `logs/`, or any auth state.

Keep it this way. The moment one person's decisions execute in another
person's account, you're in regulated-activity territory (investment
adviser / broker-dealer rules). Shared research is fine; shared execution
is not — talk to a lawyer before ever crossing that line.

## Fidelity / other accounts (read-only)

Plaid-linked accounts (Fidelity etc.) can feed the personas a full
net-worth picture, but they stay read-only — there's no agentic execution
path for them. Simplest integration: export/positions CSV into a
`context/` folder the personas read, or wire a read-only aggregator MCP
later. Keep anything read-only OUT of the trading context until it's been
through the same sanitize step as the brief.

## Files

| Path | What |
|------|------|
| `.claude/skills/` | morning-brief, two personas, trade-execution |
| `.claude/settings.json` | hook wiring (gate on all Robinhood MCP calls) |
| `guardrails/gate.py` | the enforcement layer — read it, it's short |
| `guardrails/config.example.yaml` | copy to config.yaml per person |
| `logs/trades.jsonl` | audit trail of every allow/block |
| `logs/ledger.json` | today's spend + trade count |
| `briefs/` | daily briefs, proposals, execution records |
