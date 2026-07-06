#!/usr/bin/env python3
"""
Guardrail decision core — pure, transport-agnostic.

No file I/O, no stdin/stdout, no sys.exit, no printing. `decide()` takes an
order (tool name + input), the config, and the current ledger, and returns a
Decision. Adapters do all the I/O and persist the returned ledger:

  - guardrails/gate.py       — Claude Code PreToolUse hook (today)
  - server middleware        — HTTP request -> decide() -> 200/403 (later)

Same caps, same math, one place to test. Behavior must stay identical to the
original gate; changes to the RULES belong here and must update test_core.py.

Checks, in order:
  1. Kill switch        — if active, block everything
  2. Market-type gate   — options blocked unless allow_options
  3. Ticker allowlist / blocklist
  4. Per-trade cap      — estimated notional <= per_trade_cap_usd (buys only)
  5. Daily cap          — today's spend + this trade <= daily_cap_usd (buys)
  6. Cooldown           — minimum seconds between executed trades
  7. Trade count cap    — max trades per day
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional, Tuple

# Tool names that place real orders. review_* (simulate) tools pass through.
ORDER_TOOL_PATTERN = re.compile(r"place_(equity|option)_order", re.IGNORECASE)
OPTION_TOOL_PATTERN = re.compile(r"option", re.IGNORECASE)

DEFAULT_CONFIG = {
    "per_trade_cap_usd": 100.0,
    "daily_cap_usd": 300.0,
    "max_trades_per_day": 5,
    "cooldown_seconds": 300,
    "allow_options": False,
    "ticker_allowlist": [],
    "ticker_blocklist": [],
}


@dataclass
class Decision:
    verdict: str                      # "ALLOW" or "BLOCK"
    reason: str
    notional: Optional[float] = None
    # Updated ledger to persist on ALLOW; None on BLOCK (no state change).
    ledger: Optional[dict] = None


def is_order_tool(tool_name: str) -> bool:
    """True for tools that place real orders (the ones we gate)."""
    return bool(ORDER_TOOL_PATTERN.search(tool_name or ""))


def is_option_tool(tool_name: str) -> bool:
    return bool(OPTION_TOOL_PATTERN.search(tool_name or ""))


def estimate_notional(tool_input) -> Tuple[Optional[float], Optional[str]]:
    """Best-effort notional estimate from common order fields.

    Returns (notional, None) or (None, error_message). If we can't estimate the
    size of a trade, callers block it — unknown size is not a reason to wave
    something through.
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


def extract_symbol(tool_input) -> Optional[str]:
    ti = tool_input or {}
    for key in ("symbol", "ticker", "underlying_symbol", "underlying"):
        if ti.get(key):
            return str(ti[key]).upper()
    return None


def is_sell(tool_input) -> bool:
    side = str((tool_input or {}).get("side", "")).lower()
    return side in ("sell", "sell_to_close", "close")


def decide(tool_name: str, tool_input: dict, config: dict, ledger: dict,
           now: float, killswitch_active: bool = False) -> Decision:
    """Pure guardrail decision. Does not mutate the ledger passed in."""
    cfg = {**DEFAULT_CONFIG, **(config or {})}
    ledger = dict(ledger or {})
    tool_input = tool_input or {}

    def block(reason: str, notional: Optional[float] = None) -> Decision:
        return Decision("BLOCK", reason, notional, None)

    # 1. Kill switch
    if killswitch_active:
        return block("Kill switch is active (guardrails/KILLSWITCH exists). "
                     "All trading is paused until the file is removed by the account owner.")

    symbol = extract_symbol(tool_input)
    notional, err = estimate_notional(tool_input)

    # 2. Market-type gate
    if is_option_tool(tool_name) and not cfg["allow_options"]:
        return block("Options trading is disabled in config (allow_options: false).", notional)

    # 3/4. Ticker lists
    if symbol is None:
        return block("Order has no recognizable symbol field; refusing.", notional)
    if cfg["ticker_blocklist"] and symbol in cfg["ticker_blocklist"]:
        return block(f"{symbol} is on the ticker blocklist.", notional)
    if cfg["ticker_allowlist"] and symbol not in cfg["ticker_allowlist"]:
        return block(f"{symbol} is not on the ticker allowlist.", notional)

    # Sells reduce exposure: skip the buy-side caps but still log + cooldown.
    selling = is_sell(tool_input)

    if not selling:
        # 5. Per-trade cap
        if err:
            return block(err)
        if notional > cfg["per_trade_cap_usd"]:
            return block(f"Estimated ${notional:.2f} exceeds per-trade cap of "
                         f"${cfg['per_trade_cap_usd']:.2f}.", notional)

        # 6. Daily cap
        if ledger.get("spent_usd", 0.0) + notional > cfg["daily_cap_usd"]:
            return block(f"Would put today's buys at "
                         f"${ledger.get('spent_usd', 0.0) + notional:.2f}, "
                         f"over the daily cap of ${cfg['daily_cap_usd']:.2f} "
                         f"(${ledger.get('spent_usd', 0.0):.2f} already used).", notional)

    # 7. Cooldown
    elapsed = now - ledger.get("last_trade_ts", 0)
    if elapsed < cfg["cooldown_seconds"]:
        return block(f"Cooldown: {int(cfg['cooldown_seconds'] - elapsed)}s remaining "
                     f"before the next trade is allowed.", notional)

    # 8. Trade count
    if ledger.get("trade_count", 0) >= cfg["max_trades_per_day"]:
        return block(f"Daily trade count cap reached ({cfg['max_trades_per_day']}).", notional)

    # ALLOW — build the updated ledger for the adapter to persist.
    if not selling and notional:
        ledger["spent_usd"] = ledger.get("spent_usd", 0.0) + notional
    ledger["trade_count"] = ledger.get("trade_count", 0) + 1
    ledger["last_trade_ts"] = now
    return Decision("ALLOW", "passed all checks", notional, ledger)
