"""Spending advisor — read-only personal-finance analysis.

Source-agnostic pipeline: any importer (CSV today, Plaid later) produces
`schema.Transaction` records, which `aggregate` turns into exact totals. No
trading tools live here — this package is deliberately execution-free.
"""
