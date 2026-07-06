#!/usr/bin/env python3
"""
Spending-advisor unit tests. Dependency-free: run directly
(`python3 -m advisor.test_advisor`) or under pytest.

Covers the deterministic pieces — amount parsing, merchant cleaning,
categorization, and aggregation math — so refactors stay honest.
"""

import sys
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from advisor.aggregate import aggregate          # noqa: E402
from advisor.categories import categorize         # noqa: E402
from advisor.parsing import clean_merchant, parse_amount  # noqa: E402
from advisor.schema import Transaction            # noqa: E402


def T(merchant, amount, category="x", date="2026-06-01", account="a"):
    return Transaction(date, merchant, Decimal(amount), category, account)


def test_parse_amount_variants():
    assert parse_amount("$1,234.56") == Decimal("1234.56")
    assert parse_amount("(12.34)") == Decimal("-12.34")   # accounting negative
    assert parse_amount("") is None
    assert parse_amount("n/a") is None


def test_clean_merchant_strips_noise():
    assert clean_merchant("WHOLE FOODS MKT #1043 AUSTIN TX") == "Whole Foods Mkt Austin"
    assert clean_merchant("TST* FRANKLIN BBQ AUSTIN TX") == "Franklin Bbq Austin"


def test_categorize_rules():
    assert categorize("Starbucks Store", "STARBUCKS") == "dining"
    assert categorize("Delta Air Lines", "DELTA") == "travel"
    assert categorize("Some Random LLC", "") == "uncategorized"


def test_aggregate_math_is_exact():
    txns = [
        T("Whole Foods", "84.21", "groceries"),
        T("Whole Foods", "112.66", "groceries"),
        T("Delta", "341.20", "travel"),
        T("Refund", "-52.10", "shopping"),   # negative: excluded from gross spend
    ]
    r = aggregate(txns)
    assert r["total_spend"] == "538.07"       # 84.21 + 112.66 + 341.20
    assert r["total_credits"] == "-52.10"
    assert r["net"] == "485.97"
    assert r["by_category"]["groceries"] == "196.87"
    assert r["by_category"]["travel"] == "341.20"
    assert "shopping" not in r["by_category"]  # only the refund, no positive spend
    # Whole Foods seen twice -> recurring; merchant total merged.
    assert "Whole Foods" in r["recurring_candidates"]
    top = {m["merchant"]: m for m in r["top_merchants"]}
    assert top["Whole Foods"]["spend"] == "196.87" and top["Whole Foods"]["txns"] == 2


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
