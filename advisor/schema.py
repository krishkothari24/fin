"""Normalized transaction schema shared by every spending data source.

Both the CSV importer (parsing.py) and the future Plaid importer emit
`Transaction` records in this exact shape, so aggregation and analysis never
need to know where the data came from.
"""

from dataclasses import dataclass
from decimal import Decimal


@dataclass
class Transaction:
    date: str        # ISO YYYY-MM-DD
    merchant: str    # cleaned display name
    amount: Decimal  # SPEND POSITIVE: purchases > 0, refunds/payments < 0
    category: str
    account: str     # source label (e.g. CSV filename stem, or Plaid account)


def money(value) -> str:
    """Format a Decimal/number as a fixed 2-decimal string for JSON output."""
    return f"{Decimal(value):.2f}"
