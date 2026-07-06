"""Exact aggregation over normalized Transactions.

All money math lives here so it happens once, deterministically, in Decimal —
the LLM reads these results, it does not recompute them.
"""

from collections import defaultdict
from decimal import Decimal

from advisor.categories import KNOWN_SUBSCRIPTIONS
from advisor.schema import Transaction, money


def aggregate(txns: list[Transaction]) -> dict:
    """Summarize spending. `by_category`/`top_merchants` are GROSS spend (>0 only)."""
    spend = sum((t.amount for t in txns if t.amount > 0), Decimal(0))
    credits = sum((t.amount for t in txns if t.amount < 0), Decimal(0))

    by_cat = defaultdict(lambda: Decimal(0))
    by_merch = defaultdict(lambda: Decimal(0))
    merch_count = defaultdict(int)
    for t in txns:
        if t.amount > 0:
            by_cat[t.category] += t.amount
            by_merch[t.merchant] += t.amount
            merch_count[t.merchant] += 1

    dates = sorted(t.date for t in txns if t.date)
    recurring = sorted({m for m in by_merch
                        if merch_count[m] >= 2
                        or any(k in m.lower() for k in KNOWN_SUBSCRIPTIONS)})

    return {
        "transaction_count": len(txns),
        "date_range": [dates[0], dates[-1]] if dates else [None, None],
        "total_spend": money(spend),
        "total_credits": money(credits),
        "net": money(spend + credits),
        "by_category": {k: money(v) for k, v in
                        sorted(by_cat.items(), key=lambda kv: kv[1], reverse=True)},
        "top_merchants": [{"merchant": k, "spend": money(v), "txns": merch_count[k]}
                          for k, v in sorted(by_merch.items(),
                                             key=lambda kv: kv[1], reverse=True)[:15]],
        "recurring_candidates": recurring,
    }
