import { Transaction } from "plaid";
import { mapPlaidTransaction } from "./transaction.mapper";

// A minimal Plaid transaction; cast through unknown so we only specify fields we map.
function fakeTxn(over: Partial<Transaction> = {}): Transaction {
  return {
    account_id: "plaid-acct-1",
    transaction_id: "plaid-txn-1",
    amount: 12.34,
    iso_currency_code: "USD",
    unofficial_currency_code: null,
    date: "2026-01-15",
    authorized_date: "2026-01-14",
    name: "Coffee Shop",
    merchant_name: "Blue Bottle",
    pending: false,
    payment_channel: "in store",
    personal_finance_category: { primary: "FOOD_AND_DRINK", detailed: "FOOD_AND_DRINK_COFFEE" },
    ...over,
  } as unknown as Transaction;
}

describe("mapPlaidTransaction", () => {
  it("maps the core fields and keeps amount as a precise string", () => {
    const r = mapPlaidTransaction("our-acct-uuid", fakeTxn());
    expect(r.accountId).toBe("our-acct-uuid");
    expect(r.plaidTransactionId).toBe("plaid-txn-1");
    expect(r.amount).toBe("12.34");
    expect(r.currency).toBe("USD");
    expect(r.name).toBe("Coffee Shop");
    expect(r.merchantName).toBe("Blue Bottle");
    expect(r.pending).toBe(false);
    expect(r.pfcPrimary).toBe("FOOD_AND_DRINK");
    expect(r.pfcDetailed).toBe("FOOD_AND_DRINK_COFFEE");
    expect(r.paymentChannel).toBe("in store");
  });

  it("parses dates to UTC-midnight Date objects", () => {
    const r = mapPlaidTransaction("a", fakeTxn());
    expect(r.date.toISOString()).toBe("2026-01-15T00:00:00.000Z");
    expect(r.authorizedDate?.toISOString()).toBe("2026-01-14T00:00:00.000Z");
  });

  it("tolerates missing optional fields", () => {
    const r = mapPlaidTransaction("a", fakeTxn({
      merchant_name: null,
      authorized_date: null,
      iso_currency_code: null,
      unofficial_currency_code: "BTC",
      personal_finance_category: null,
    }));
    expect(r.merchantName).toBeNull();
    expect(r.authorizedDate).toBeNull();
    expect(r.currency).toBe("BTC");
    expect(r.pfcPrimary).toBeNull();
    expect(r.pfcDetailed).toBeNull();
  });
});
