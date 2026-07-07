import { Account, Prisma } from "@prisma/client";
import { toAccountDto } from "./account.dto";

function fakeRow(over: Partial<Account> = {}): Account {
  return {
    id: "acct-1",
    itemId: "item-1",
    plaidAccountId: "plaid-acct-1",
    name: "Checking",
    officialName: "Plaid Gold Checking",
    mask: "0000",
    type: "depository",
    subtype: "checking",
    currentBalance: new Prisma.Decimal("100.5000"),
    availableBalance: null,
    currency: "USD",
    isHidden: false,
    updatedAt: new Date(),
    ...over,
  } as Account;
}

describe("toAccountDto", () => {
  it("stringifies decimal balances and attaches the institution name", () => {
    const dto = toAccountDto(fakeRow(), "First Platypus Bank");
    expect(dto.currentBalance).toBe("100.5");
    expect(dto.availableBalance).toBeNull();
    expect(dto.institutionName).toBe("First Platypus Bank");
    expect(dto.isHidden).toBe(false);
  });
});
