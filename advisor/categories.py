"""Transaction categorization rules.

Keyword-based, first-match-wins. Order matters: put specific categories before
broad ones. This is the one file to edit when a merchant lands in the wrong
bucket or too much shows up as `uncategorized`.
"""

# (category, [substrings that map to it]) — matched against merchant + raw desc.
CATEGORY_RULES = [
    ("groceries",     ["whole foods", "trader joe", "safeway", "kroger", "aldi",
                       "costco", "grocery", "wegmans", "publix", "sprouts"]),
    ("dining",        ["restaurant", "cafe", "coffee", "starbucks", "mcdonald",
                       "chipotle", "doordash", "ubereats", "uber eats", "grubhub",
                       "pizza", "bar ", "tst*", "sq *", "bakery", "deli"]),
    ("transport",     ["uber", "lyft", "shell", "chevron", "exxon", "bp ", "gas",
                       "parking", "toll", "transit", "mta", "bart", "76 "]),
    ("subscriptions", ["netflix", "spotify", "hulu", "disney+", "youtube premium",
                       "apple.com/bill", "prime video", "hbo", "patreon",
                       "substack", "openai", "anthropic", "notion", "adobe"]),
    ("shopping",      ["amazon", "amzn", "target", "walmart", "best buy", "ebay",
                       "etsy", "nike", "apple store", "ikea"]),
    ("utilities",     ["comcast", "xfinity", "verizon", "at&t", "t-mobile",
                       "pg&e", "electric", "water", "internet", "utility"]),
    ("travel",        ["airline", "united", "delta", "southwest", "airbnb",
                       "hotel", "marriott", "hilton", "expedia", "booking.com"]),
    ("health",        ["pharmacy", "cvs", "walgreens", "clinic", "medical",
                       "dental", "gym", "fitness", "doctor"]),
    ("income/credit", ["payroll", "direct dep", "refund", "payment thank",
                       "autopay", "cashback"]),
]

# Merchants treated as recurring subscriptions regardless of frequency seen.
KNOWN_SUBSCRIPTIONS = {"netflix", "spotify", "hulu", "disney", "youtube", "hbo",
                       "adobe", "notion", "openai", "anthropic", "patreon",
                       "prime video", "apple.com/bill"}


def categorize(merchant: str, raw_desc: str = "") -> str:
    """Return the first category whose keywords appear in merchant/desc."""
    hay = f"{merchant} {raw_desc}".lower()
    for category, keywords in CATEGORY_RULES:
        if any(k in hay for k in keywords):
            return category
    return "uncategorized"
