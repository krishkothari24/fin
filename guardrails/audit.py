"""Append-only audit log for the guardrail gate.

Every decision — ALLOW and BLOCK — is written to logs/trades.jsonl as one JSON
line. This is the trail you read to see what the gate did and why.
"""

import json
from datetime import datetime
from pathlib import Path


def log_decision(path: Path, decision: str, reason: str, tool_name: str,
                 tool_input: dict, notional) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a") as f:
        f.write(json.dumps({
            "ts": datetime.now().isoformat(),
            "decision": decision,
            "reason": reason,
            "tool": tool_name,
            "estimated_notional_usd": notional,
            "input": tool_input,
        }) + "\n")
