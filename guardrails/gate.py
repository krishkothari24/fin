#!/usr/bin/env python3
"""
Trade guardrail gate — Claude Code PreToolUse hook.

Runs BEFORE any Robinhood MCP order-placement tool call. Reads the hook
payload from stdin, checks it against config.yaml, and either allows the
call (exit 0) or blocks it (exit 2, message on stderr goes back to Claude).

This is the hard enforcement layer. Prompts can be argued with; this can't.

Checks, in order:
  1. Kill switch        — if killswitch file exists, block everything
  2. Market-type gate   — options / crypto blocked unless enabled
  3. Ticker allowlist   — symbol must be on the list (if list is non-empty)
  4. Ticker blocklist   — symbol must not be on the blocklist
  5. Per-trade cap      — estimated notional <= per_trade_cap_usd
  6. Daily cap          — today's spend + this trade <= daily_cap_usd
  7. Cooldown           — minimum seconds between executed trades
  8. Trade count cap    — max trades per day

Every decision (allow AND block) is appended to logs/trades.jsonl.
"""

import json
import sys
import time
import re
from datetime import datetime, date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT / "guardrails" / "config.yaml"
LEDGER_PATH = ROOT / "logs" / "ledger.json"
LOG_PATH = ROOT / "logs" / "trades.jsonl"
KILLSWITCH_PATH = ROOT / "guardrails" / "KILLSWITCH"

# Tool names that place real orders. review_* (simulate) tools pass through.
ORDER_TOOL_PATTERN = re.compile(r"place_(equity|option)_order", re.IGNORECASE)
OPTION_TOOL_PATTERN = re.compile(r"option", re.IGNORECASE)


def load_config():
    """Minimal YAML reader for our flat config (no external deps)."""
    cfg = {
        "per_trade_cap_usd": 100.0,
        "daily_cap_usd": 300.0,
        "max_trades_per_day": 5,
        "cooldown_seconds": 300,
        "allow_options": False,
        "ticker_allowlist": [],
        "ticker_blocklist": [],
    }
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


def estimate_notional(tool_input):
    """Best-effort notional estimate from common order fields.

    Returns (notional, None) or (None, error_message). If we can't
    estimate the size of a trade, we block it — unknown size is not a
    reason to wave something through.
    """
    ti = tool_input or {}
    for key in ("amount", "amount_usd", "notional", "dollar_amount"):
        if key in ti:
            try:
                return float(ti[key]), None
            except (TypeError, ValueError):
                pass
    qty = ti.get("quantity") or ti.get("shares") or ti.get("qty")
    price = (ti.get("limit_price") or ti.get("price")
             or ti.get("stop_price") or ti.get("estimated_price"))
    if qty is not None and price is not None:
        try:
            return float(qty) * float(price), None
        except (TypeError, ValueError):
            pass
    if qty is not None and price is None:
        return None, ("Cannot estimate notional: market order with no price info. "
                      "Use a limit order, or include estimated_price from a quote.")
    return None, "Cannot estimate notional from order fields; refusing unknown-size trade."


def extract_symbol(tool_input):
    ti = tool_input or {}
    for key in ("symbol", "ticker", "underlying_symbol", "underlying"):
        if ti.get(key):
            return str(ti[key]).upper()
    return None


def is_sell(tool_input):
    side = str((tool_input or {}).get("side", "")).lower()
    return side in ("sell", "sell_to_close", "close")


def block(reason, tool_name, tool_input, notional=None):
    log_decision("BLOCK", reason, tool_name, tool_input, notional)
    print(f"GUARDRAIL BLOCKED THIS TRADE: {reason}", file=sys.stderr)
    sys.exit(2)


def main():
    payload = json.load(sys.stdin)
    tool_name = payload.get("tool_name", "")
    tool_input = payload.get("tool_input", {})

    # Only gate real order placement; reads and simulations pass through.
    if not ORDER_TOOL_PATTERN.search(tool_name):
        sys.exit(0)

    cfg = load_config()
    ledger = load_ledger()

    # 1. Kill switch
    if KILLSWITCH_PATH.exists():
        block("Kill switch is active (guardrails/KILLSWITCH exists). "
              "All trading is paused until the file is removed by the account owner.",
              tool_name, tool_input)

    symbol = extract_symbol(tool_input)
    notional, err = estimate_notional(tool_input)

    # 2. Market-type gate
    if OPTION_TOOL_PATTERN.search(tool_name) and not cfg["allow_options"]:
        block("Options trading is disabled in config (allow_options: false).",
              tool_name, tool_input, notional)

    # 3/4. Ticker lists
    if symbol is None:
        block("Order has no recognizable symbol field; refusing.", tool_name, tool_input, notional)
    if cfg["ticker_blocklist"] and symbol in cfg["ticker_blocklist"]:
        block(f"{symbol} is on the ticker blocklist.", tool_name, tool_input, notional)
    if cfg["ticker_allowlist"] and symbol not in cfg["ticker_allowlist"]:
        block(f"{symbol} is not on the ticker allowlist.", tool_name, tool_input, notional)

    # Sells reduce exposure: skip the buy-side caps but still log + cooldown.
    selling = is_sell(tool_input)

    if not selling:
        # 5. Per-trade cap
        if err:
            block(err, tool_name, tool_input)
        if notional > cfg["per_trade_cap_usd"]:
            block(f"Estimated ${notional:.2f} exceeds per-trade cap of "
                  f"${cfg['per_trade_cap_usd']:.2f}.", tool_name, tool_input, notional)

        # 6. Daily cap
        if ledger["spent_usd"] + notional > cfg["daily_cap_usd"]:
            block(f"Would put today's buys at ${ledger['spent_usd'] + notional:.2f}, "
                  f"over the daily cap of ${cfg['daily_cap_usd']:.2f} "
                  f"(${ledger['spent_usd']:.2f} already used).",
                  tool_name, tool_input, notional)

    # 7. Cooldown
    elapsed = time.time() - ledger["last_trade_ts"]
    if elapsed < cfg["cooldown_seconds"]:
        block(f"Cooldown: {int(cfg['cooldown_seconds'] - elapsed)}s remaining "
              f"before the next trade is allowed.", tool_name, tool_input, notional)

    # 8. Trade count
    if ledger["trade_count"] >= cfg["max_trades_per_day"]:
        block(f"Daily trade count cap reached ({cfg['max_trades_per_day']}).",
              tool_name, tool_input, notional)

    # ALLOW — update ledger and log
    if not selling and notional:
        ledger["spent_usd"] += notional
    ledger["trade_count"] += 1
    ledger["last_trade_ts"] = time.time()
    save_ledger(ledger)
    log_decision("ALLOW", "passed all checks", tool_name, tool_input, notional)
    sys.exit(0)


if __name__ == "__main__":
    main()
