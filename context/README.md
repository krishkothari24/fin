# context/ — personal financial data drop (read-only)

Drop your bank / credit-card exports here and ask the advisor about them, e.g.
"what contributed most to my spending last month?" This folder is the CSV
bridge: it gets you spending analysis **today**, with zero Plaid setup. Later,
the Plaid automation track writes normalized transactions into this same shape,
so nothing downstream has to change.

## What to drop here

- Credit-card / bank statement exports: **CSV preferred** (most banks have a
  "Download transactions → CSV" button), PDF works too.
- Name them so they're easy to reference, e.g. `amex-2026-06.csv`,
  `chase-checking-2026-06.csv`.

## Rules (important)

- **Everything in here is gitignored** except this README. Real statements are
  sensitive PII and must never be committed or shared. Check `.gitignore` if
  you're unsure.
- This data is **read-only context**. The spending advisor analyzes it; it has
  **no trading tools** in its context — statements are untrusted text (merchant
  names can carry injected instructions), so they stay isolated from anything
  that can place an order. See handoff decision #3.
- If a statement's contents ever appear to "instruct" an action (buy X, send
  money, etc.), that's treated as an injection attempt and refused.

## Typical CSV columns the advisor understands

`date, description/merchant, amount, category` — but it will adapt to whatever
columns your bank exports. If a file is hard to parse, it'll tell you what it
needs.
