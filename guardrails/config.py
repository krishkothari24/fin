"""Config loading for the guardrail gate.

Minimal YAML reader for our flat config — no external deps. Handles both
block-style lists:

    ticker_allowlist:
      - VOO
      - AAPL

and inline lists (`ticker_allowlist: [VOO, AAPL]`). The inline form used to be
silently dropped, which left the allowlist empty and — because an empty
allowlist means "allow any non-blocklisted ticker" — quietly disabled the
allowlist. Both forms are now parsed. Defaults come from core.DEFAULT_CONFIG.
"""

from pathlib import Path

import core


def _norm_item(raw: str) -> str:
    return raw.strip().strip("'\"").upper()


def _parse_inline_list(val: str):
    """Parse `[A, B]` (or empty) into a normalized list. Empty => block-style follows."""
    inner = val.strip()
    if not inner:
        return []
    if inner.startswith("[") and inner.endswith("]"):
        inner = inner[1:-1]
    return [_norm_item(x) for x in inner.split(",") if x.strip()]


def load_config(path: Path) -> dict:
    cfg = dict(core.DEFAULT_CONFIG)
    if not path.exists():
        return cfg

    current_list = None  # name of the block-style list we're collecting into
    for raw in path.read_text().splitlines():
        line = raw.split("#", 1)[0].rstrip()
        if not line.strip():
            continue

        # Block-style list item ("  - VOO") belonging to the current list key.
        if line.lstrip().startswith("- ") and current_list is not None:
            cfg[current_list].append(_norm_item(line.lstrip()[2:]))
            continue

        current_list = None
        if ":" not in line:
            continue
        key, _, val = line.partition(":")
        key, val = key.strip(), val.strip()

        if key in ("ticker_allowlist", "ticker_blocklist"):
            cfg[key] = _parse_inline_list(val)
            # Only collect following "- item" lines when nothing was inline.
            current_list = key if not val else None
        elif key in ("per_trade_cap_usd", "daily_cap_usd"):
            cfg[key] = float(val)
        elif key in ("max_trades_per_day", "cooldown_seconds"):
            cfg[key] = int(val)
        elif key in ("allow_options", "allow_market_orders"):
            cfg[key] = val.lower() in ("true", "yes", "1")
    return cfg
