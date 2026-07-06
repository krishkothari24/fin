"""Daily ledger persistence for the guardrail gate.

Tracks today's spend, trade count, and last-trade timestamp. Resets when the
stored date isn't today. Pure file I/O — the spend/count math lives in core.py.
"""

import json
from datetime import date
from pathlib import Path


def load_ledger(path: Path) -> dict:
    today = date.today().isoformat()
    if path.exists():
        ledger = json.loads(path.read_text())
        if ledger.get("date") == today:
            return ledger
    return {"date": today, "spent_usd": 0.0, "trade_count": 0, "last_trade_ts": 0}


def save_ledger(path: Path, ledger: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(ledger, indent=2))
