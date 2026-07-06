#!/usr/bin/env python3
"""
Spending analyzer CLI — the entry point the spending-advisor skill calls.

Thin wiring only: load transactions -> aggregate -> print JSON. All the real
work lives in the package modules (parsing, aggregate, categories, schema).

Run from the repo root:
    python3 -m advisor.analyze [folder_or_file] [--credit-positive] [--summary]

    python3 -m advisor.analyze context/                 # all CSVs in context/
    python3 -m advisor.analyze context/amex-2026-06.csv # one file

--credit-positive : source treats credits/deposits as positive (flip sign)
--summary         : also print a human-readable table to stderr

Zero external dependencies (stdlib only).
"""

import json
import sys
from pathlib import Path

# Allow `python3 advisor/analyze.py ...` too by ensuring the repo root is importable.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from advisor.aggregate import aggregate  # noqa: E402
from advisor.parsing import load          # noqa: E402


def main(argv):
    positional = [a for a in argv if not a.startswith("--")]
    credit_positive = "--credit-positive" in argv
    summary = "--summary" in argv
    target = Path(positional[0]) if positional else Path("context")

    txns, warnings, files = load(target, credit_positive)
    if not files:
        print(json.dumps({"error": f"no CSV files found at {target}"}))
        return 1

    result = aggregate(txns)
    result["files"] = [f.name for f in files]
    result["warnings"] = warnings
    print(json.dumps(result, indent=2))

    if summary:
        print(f"\n{result['transaction_count']} txns "
              f"{result['date_range'][0]}..{result['date_range'][1]}  "
              f"spend ${result['total_spend']} net ${result['net']}", file=sys.stderr)
        for cat, amt in result["by_category"].items():
            print(f"  {cat:16} ${amt}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
