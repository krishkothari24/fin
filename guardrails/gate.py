#!/usr/bin/env python3
"""
Trade guardrail gate — Claude Code PreToolUse hook.

Wiring only: read the hook payload from stdin, load config + ledger, ask the
pure core for a decision, log it, and either allow (exit 0) or block (exit 2,
reason on stderr). Everything else lives in focused modules:

    core.py    - the decision RULES (pure, transport-agnostic, tested)
    config.py  - load config.yaml
    ledger.py  - load/save the daily spend ledger
    audit.py   - append to logs/trades.jsonl

This file owns the project layout (paths) and nothing else. Do not put policy
here.
"""

import json
import sys
import time
from pathlib import Path

# Import sibling modules (this file's directory is on sys.path when run as a script).
sys.path.insert(0, str(Path(__file__).resolve().parent))
import core          # noqa: E402
from config import load_config          # noqa: E402
from ledger import load_ledger, save_ledger  # noqa: E402
from audit import log_decision          # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT / "guardrails" / "config.yaml"
LEDGER_PATH = ROOT / "logs" / "ledger.json"
LOG_PATH = ROOT / "logs" / "trades.jsonl"
KILLSWITCH_PATH = ROOT / "guardrails" / "KILLSWITCH"


def main():
    payload = json.load(sys.stdin)
    tool_name = payload.get("tool_name", "")
    tool_input = payload.get("tool_input", {})

    # Only gate real order placement; reads and simulations pass through.
    if not core.is_order_tool(tool_name):
        sys.exit(0)

    cfg = load_config(CONFIG_PATH)
    ledger = load_ledger(LEDGER_PATH)

    d = core.decide(tool_name, tool_input, cfg, ledger,
                    now=time.time(), killswitch_active=KILLSWITCH_PATH.exists())

    log_decision(LOG_PATH, d.verdict, d.reason, tool_name, tool_input, d.notional)

    if d.verdict == "BLOCK":
        print(f"GUARDRAIL BLOCKED THIS TRADE: {d.reason}", file=sys.stderr)
        sys.exit(2)

    save_ledger(LEDGER_PATH, d.ledger)
    sys.exit(0)


if __name__ == "__main__":
    main()
