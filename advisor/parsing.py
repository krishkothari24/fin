"""CSV import: messy bank / credit-card exports -> normalized Transactions.

Auto-detects the date / amount / description columns, cleans merchant strings,
parses money as Decimal, and normalizes every row to SPEND POSITIVE. Anything it
can't map is surfaced as a warning rather than silently guessed.
"""

import csv
import re
from decimal import Decimal, InvalidOperation
from pathlib import Path

from advisor.categories import categorize
from advisor.schema import Transaction

# Header-name hints for column auto-detection (exact match preferred, else substring).
DATE_HINTS = ("date", "posted", "transaction date", "trans date")
AMOUNT_HINTS = ("amount", "debit", "charge", "value")
CREDIT_HINTS = ("credit", "deposit")
DESC_HINTS = ("description", "merchant", "name", "payee", "details", "memo")


def clean_merchant(raw: str) -> str:
    """Strip processor prefixes, store numbers, and trailing STATE/zip noise."""
    s = (raw or "").strip()
    s = re.sub(r"^(tst\*|sq \*|paypal \*|sp \*|amzn mktp\w*)", "", s, flags=re.I)
    s = re.sub(r"#\s*\d+", "", s)                  # store numbers (#1043)
    s = re.sub(r"\b\d{3,}\b", "", s)               # standalone digit runs
    s = re.sub(r"\s+[A-Z]{2}\s*\d{0,5}$", "", s)   # trailing STATE + optional zip
    s = re.sub(r"\s{2,}", " ", s).strip(" -*")
    return s.title() if s else (raw or "").strip()


def parse_amount(val):
    """Parse a money string to Decimal. Handles $, commas, and (accounting) negatives."""
    if val is None:
        return None
    s = str(val).strip().replace(",", "").replace("$", "")
    if not s:
        return None
    neg = s.startswith("(") and s.endswith(")")
    s = s.strip("()")
    try:
        d = Decimal(s)
    except InvalidOperation:
        return None
    return -d if neg else d


def pick_column(header, hints):
    """Index of the first column matching a hint (exact match, then substring)."""
    low = [h.lower().strip() for h in header]
    for hint in hints:
        if hint in low:
            return low.index(hint)
    for hint in hints:
        for i, h in enumerate(low):
            if hint in h:
                return i
    return None


def normalize_file(path: Path, credit_positive: bool = False):
    """Return (transactions, warning_or_None) for one CSV file."""
    rows = list(csv.reader(path.open(newline="", encoding="utf-8-sig")))
    if not rows:
        return [], f"{path.name}: empty"
    header = rows[0]
    di, ai, ci, ni = (pick_column(header, h)
                      for h in (DATE_HINTS, AMOUNT_HINTS, CREDIT_HINTS, DESC_HINTS))
    if di is None or ai is None or ni is None:
        return [], (f"{path.name}: could not find date/amount/description columns "
                    f"(saw {header}). Needs manual mapping.")

    txns = []
    for r in rows[1:]:
        if len(r) <= max(di, ai, ni):
            continue
        amt = parse_amount(r[ai])
        if amt is None and ci is not None and len(r) > ci:
            amt = parse_amount(r[ci])
        if amt is None:
            continue
        if credit_positive:            # source treats credits as positive -> flip
            amt = -amt
        merchant = clean_merchant(r[ni])
        txns.append(Transaction(
            date=(r[di] or "").strip(),
            merchant=merchant,
            amount=amt,
            category=categorize(merchant, r[ni]),
            account=path.stem,
        ))
    return txns, None


def load(target: Path, credit_positive: bool = False):
    """Load a file or every *.csv in a folder. Returns (transactions, warnings, files)."""
    files = [target] if target.is_file() else sorted(target.glob("*.csv"))
    all_txns, warnings = [], []
    for f in files:
        txns, warn = normalize_file(f, credit_positive)
        all_txns.extend(txns)
        if warn:
            warnings.append(warn)
    return all_txns, warnings, files
