import { AccountBase } from "plaid";
import { mapPlaidAccount } from "./account.mapper";

function fakeAccount(over: Partial<AccountBase> = {}): AccountBase {
  return {
    account_id: "acc_1",
    name: "Plaid Checking",
    official_name: "Plaid Gold Standard 0% Interest Checking",
    mask: "0000",
    type: "depository",
    subtype: "checking",
    balances: {
      current: 110.0,
      available: 100.0,
      iso_currency_code: "USD",
      limit: null,
      unofficial_currency_code: null,
    },
    ...over,
  } as AccountBase;
}

describe("mapPlaidAccount", () => {
  it("maps core fields and balances", () => {
    const r = mapPlaidAccount("item_1", fakeAccount());
    expect(r).toMatchObject({
      itemId: "item_1",
      plaidAccountId: "acc_1",
      name: "Plaid Checking",
      type: "depository",
      subtype: "checking",
      currentBalance: 110.0,
      availableBalance: 100.0,
      currency: "USD",
    });
  });

  it("defaults currency and nulls missing optionals", () => {
    const r = mapPlaidAccount(
      "item_1",
      fakeAccount({
        official_name: null,
        mask: null,
        subtype: null,
        balances: {
          current: null,
          available: null,
          iso_currency_code: null,
          limit: null,
          unofficial_currency_code: null,
        },
      }),
    );
    expect(r.officialName).toBeNull();
    expect(r.mask).toBeNull();
    expect(r.subtype).toBeNull();
    expect(r.currentBalance).toBeNull();
    expect(r.currency).toBe("USD");
  });
});
