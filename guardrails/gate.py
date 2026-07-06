#!/usr/bin/env python3
"""
Trade guardrail gate — Claude Code PreToolUse hook (thin adapter over core.py).

Runs BEFORE any Robinhood MCP order-placement tool call. Reads the hook payload
from stdin, loads config + ledger from disk, asks guardrails/core.py for a
decision, then either allows the call (exit 0) or blocks it (exit 2, message on
stderr goes back to Claude). Every decision (allow AND block) is appended to
logs/trades.jsonl.

All the RULES live in core.py (pure, transport-agnostic, tested). This file is
only I/O: files in, decision out, exit code. Do not put policy here.
"""

import json
import sys
import time
from datetime import datetime, date
from pathlib import Path

# Import the pure decision core sitting next to this file.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import core  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT / "guardrails" / "config.yaml"
LEDGER_PATH = ROOT / "logs" / "ledger.json"
LOG_PATH = ROOT / "logs" / "trades.jsonl"
KILLSWITCH_PATH = ROOT / "guardrails" / "KILLSWITCH"


def load_config():
    """Minimal YAML reader for our flat config (no external deps)."""
    cfg = dict(core.DEFAULT_CONFIG)
    if not CONFIG_PATH.exists():
        return cfg
    current_list = None
    for raw in CONFIG_PATH.read_text().splitlines():
        line = raw.split("#", 1)[0].rstrip()
        if not line.strip():
            continue
        if line.startswith("  - ") and current_list is not None:
            cfg[current_list].append(line.strip()[2:].strip().upper())
            continue
        current_list = None
        if ":" not in line:
            continue
        key, _, val = line.partition(":")
        key, val = key.strip(), val.strip()
        if key in ("ticker_allowlist", "ticker_blocklist"):
            cfg[key] = []
            current_list = key
        elif key in ("per_trade_cap_usd", "daily_cap_usd"):
            cfg[key] = float(val)
        elif key in ("max_trades_per_day", "cooldown_seconds"):
            cfg[key] = int(val)
        elif key == "allow_options":
            cfg[key] = val.lower() in ("true", "yes", "1")
    return cfg


def load_ledger():
    today = date.today().isoformat()
    if LEDGER_PATH.exists():
        ledger = json.loads(LEDGER_PATH.read_text())
        if ledger.get("date") == today:
            return ledger
    return {"date": today, "spent_usd": 0.0, "trade_count": 0, "last_trade_ts": 0}


def save_ledger(ledger):
    LEDGER_PATH.parent.mkdir(parents=True, exist_ok=True)
    LEDGER_PATH.write_text(json.dumps(ledger, indent=2))


def log_decision(decision, reason, tool_name, tool_input, notional):
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with LOG_PATH.open("a") as f:
        f.write(json.dumps({
            "ts": datetime.now().isoformat(),
            "decision": decision,
            "reason": reason,
            "tool": tool_name,
            "estimated_notional_usd": notional,
            "input": tool_input,
        }) + "\n")


def main():
    payload = json.load(sys.stdin)
    tool_name = payload.get("tool_name", "")
    tool_input = payload.get("tool_input", {})

    # Only gate real order placement; reads and simulations pass through.
    if not core.is_order_tool(tool_name):
        sys.exit(0)

    cfg = load_config()
    ledger = load_ledger()

    d = core.decide(tool_name, tool_input, cfg, ledger,
                    now=time.time(), killswitch_active=KILLSWITCH_PATH.exists())

    log_decision(d.verdict, d.reason, tool_name, tool_input, d.notional)

    if d.verdict == "BLOCK":
        print(f"GUARDRAIL BLOCKED THIS TRADE: {d.reason}", file=sys.stderr)
        sys.exit(2)

    save_ledger(d.ledger)
    sys.exit(0)


if __name__ == "__main__":
    main()
