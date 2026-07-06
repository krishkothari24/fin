#!/usr/bin/env python3
"""
Guardrail core test harness.

Runs the pure decision logic (core.decide) through every scenario the gate is
supposed to enforce, using REAL Robinhood MCP order schemas. No external deps —
run directly (`python3 guardrails/test_core.py`) or under pytest.

If you change a rule in core.py, update the matching assertion here. A green run
is the contract that the gate still does what we think it does.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import core  # noqa: E402

CFG = {
    "per_trade_cap_usd": 100.0,
    "daily_cap_usd": 300.0,
    "max_trades_per_day": 5,
    "cooldown_seconds": 300,
    "allow_options": False,
    "ticker_allowlist": ["AAPL", "VOO"],
    "ticker_blocklist": ["GME"],
}
NOW = 1_000_000.0


def fresh_ledger(**over):
    led = {"date": "2026-07-06", "spent_usd": 0.0, "trade_count": 0, "last_trade_ts": 0}
    led.update(over)
    return led


def equity(symbol="AAPL", side="buy", type="limit", qty="1", price="50", **extra):
    ti = {"account_number": "A", "symbol": symbol, "side": side, "type": type}
    if qty is not None:
        ti["quantity"] = qty
    if price is not None:
        ti["limit_price"] = price
    ti.update(extra)
    return "mcp__robinhood-trading__place_equity_order", ti


def option():
    return "mcp__robinhood-trading__place_option_order", {
        "account_number": "A", "quantity": "1", "price": "2.50", "type": "limit",
        "legs": [{"option_id": "uuid-1", "side": "buy", "position_effect": "open"}],
    }


# --- scenarios -------------------------------------------------------------

def test_allow_normal_buy():
    tn, ti = equity(qty="1", price="50")            # $50, under caps, on allowlist
    d = core.decide(tn, ti, CFG, fresh_ledger(), NOW)
    assert d.verdict == "ALLOW", d.reason
    assert d.notional == 50.0
    assert d.ledger["spent_usd"] == 50.0
    assert d.ledger["trade_count"] == 1
    assert d.ledger["last_trade_ts"] == NOW


def test_block_blocklist():
    tn, ti = equity(symbol="GME")
    d = core.decide(tn, ti, CFG, fresh_ledger(), NOW)
    assert d.verdict == "BLOCK" and "blocklist" in d.reason


def test_block_allowlist_miss():
    tn, ti = equity(symbol="TSLA")                  # not on allowlist, not blocked
    d = core.decide(tn, ti, CFG, fresh_ledger(), NOW)
    assert d.verdict == "BLOCK" and "allowlist" in d.reason


def test_block_per_trade_cap():
    tn, ti = equity(qty="10", price="50")           # $500 > $100 per-trade
    d = core.decide(tn, ti, CFG, fresh_ledger(), NOW)
    assert d.verdict == "BLOCK" and "per-trade cap" in d.reason
    assert d.ledger is None                          # blocks never mutate state


def test_block_daily_cap():
    tn, ti = equity(qty="1", price="50")            # +$50 onto $280 spent = $330 > $300
    d = core.decide(tn, ti, CFG, fresh_ledger(spent_usd=280.0), NOW)
    assert d.verdict == "BLOCK" and "daily cap" in d.reason


def test_block_cooldown():
    tn, ti = equity()
    led = fresh_ledger(last_trade_ts=NOW - 100)     # 100s elapsed < 300s cooldown
    d = core.decide(tn, ti, CFG, led, NOW)
    assert d.verdict == "BLOCK" and "Cooldown" in d.reason


def test_block_market_order_disabled():
    # Market orders are off by default — blocked before we even price them.
    tn, ti = equity(type="market", qty="3", price=None)
    d = core.decide(tn, ti, CFG, fresh_ledger(), NOW)
    assert d.verdict == "BLOCK" and "Market orders are disabled" in d.reason


def test_block_unpriced_when_market_allowed():
    # With market orders explicitly enabled, an unpriced one still can't be sized.
    cfg = {**CFG, "allow_market_orders": True}
    tn, ti = equity(type="market", qty="3", price=None)
    d = core.decide(tn, ti, cfg, fresh_ledger(), NOW)
    assert d.verdict == "BLOCK" and "market order with no price" in d.reason


def test_stop_market_also_blocked_by_default():
    tn, ti = equity(type="stop_market", qty="1", price="50")
    d = core.decide(tn, ti, CFG, fresh_ledger(), NOW)
    assert d.verdict == "BLOCK" and "Market orders are disabled" in d.reason


def test_block_options_disabled():
    tn, ti = option()
    d = core.decide(tn, ti, CFG, fresh_ledger(), NOW)
    assert d.verdict == "BLOCK" and "Options trading is disabled" in d.reason


def test_block_kill_switch():
    tn, ti = equity()
    d = core.decide(tn, ti, CFG, fresh_ledger(), NOW, killswitch_active=True)
    assert d.verdict == "BLOCK" and "Kill switch" in d.reason


def test_sell_bypasses_buy_caps():
    # A big sell exceeds every buy cap but should ALLOW (reduces exposure) and
    # must not add to spent_usd.
    tn, ti = equity(side="sell", qty="100", price="50")   # $5000 notional
    d = core.decide(tn, ti, CFG, fresh_ledger(), NOW)
    assert d.verdict == "ALLOW", d.reason
    assert d.ledger["spent_usd"] == 0.0
    assert d.ledger["trade_count"] == 1


def test_trade_count_cap():
    tn, ti = equity()
    led = fresh_ledger(trade_count=5, last_trade_ts=0)   # already at max 5
    d = core.decide(tn, ti, CFG, led, NOW)
    assert d.verdict == "BLOCK" and "trade count cap" in d.reason


def test_review_tool_is_not_gated():
    # Simulations must pass through untouched (adapter uses this to short-circuit).
    assert core.is_order_tool("mcp__robinhood-trading__review_equity_order") is False
    assert core.is_order_tool("mcp__robinhood-trading__place_equity_order") is True


def test_does_not_mutate_caller_ledger():
    tn, ti = equity()
    led = fresh_ledger()
    core.decide(tn, ti, CFG, led, NOW)
    assert led["trade_count"] == 0 and led["spent_usd"] == 0.0   # untouched


# --- runner (no pytest required) -------------------------------------------

def _run():
    tests = [v for k, v in sorted(globals().items())
             if k.startswith("test_") and callable(v)]
    failed = 0
    for t in tests:
        try:
            t()
            print(f"  PASS  {t.__name__}")
        except AssertionError as e:
            failed += 1
            print(f"  FAIL  {t.__name__}: {e}")
        except Exception as e:  # noqa: BLE001
            failed += 1
            print(f"  ERROR {t.__name__}: {type(e).__name__}: {e}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(_run())
