#!/usr/bin/env python3
"""
Config-parser tests. Dependency-free: run directly
(`python3 guardrails/test_config.py`) or under pytest.

The important case is the old fail-open footgun: an inline-list allowlist must
NOT silently parse to empty (which would disable the allowlist entirely).
"""

import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import load_config  # noqa: E402


def _load(text):
    with tempfile.NamedTemporaryFile("w", suffix=".yaml", delete=False) as f:
        f.write(text)
        p = Path(f.name)
    try:
        return load_config(p)
    finally:
        p.unlink()


def test_block_style_list():
    cfg = _load("ticker_allowlist:\n  - voo\n  - aapl\n")
    assert cfg["ticker_allowlist"] == ["VOO", "AAPL"]


def test_inline_list_is_not_dropped():
    # The footgun: this used to parse to [] and silently disable the allowlist.
    cfg = _load("ticker_allowlist: [voo, aapl, msft]\n")
    assert cfg["ticker_allowlist"] == ["VOO", "AAPL", "MSFT"]


def test_scalars_and_bools():
    cfg = _load("per_trade_cap_usd: 250\ncooldown_seconds: 60\n"
                "allow_options: true\nallow_market_orders: yes\n")
    assert cfg["per_trade_cap_usd"] == 250.0
    assert cfg["cooldown_seconds"] == 60
    assert cfg["allow_options"] is True
    assert cfg["allow_market_orders"] is True


def test_defaults_when_missing_keys():
    cfg = _load("per_trade_cap_usd: 50\n")
    assert cfg["daily_cap_usd"] == 300.0            # from DEFAULT_CONFIG
    assert cfg["allow_market_orders"] is False
    assert cfg["ticker_allowlist"] == []


def test_comments_stripped():
    cfg = _load("ticker_blocklist:\n  - gme   # meme name\n")
    assert cfg["ticker_blocklist"] == ["GME"]


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
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(_run())
