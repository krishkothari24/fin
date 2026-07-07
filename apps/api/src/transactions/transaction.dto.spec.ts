import { Prisma, Transaction } from "@prisma/client";
import { toTransactionDto } from "./transaction.dto";

function fakeRow(over: Partial<Transaction> = {}): Transaction {
  return {
    id: "uuid-1",
    accountId: "acct-1",
    plaidTransactionId: "plaid-1",
    amount: new Prisma.Decimal("12.3400"),
    currency: "USD",
    date: new Date("2026-01-15T00:00:00.000Z"),
    authorizedDate: null,
    name: "Coffee",
    merchantName: "Blue Bottle",
    pending: false,
    pfcPrimary: "FOOD_AND_DRINK",
    pfcDetailed: "FOOD_AND_DRINK_COFFEE",
    paymentChannel: "in store",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as Transaction;
}

describe("toTransactionDto", () => {
  it("stringifies the decimal amount and formats the date as YYYY-MM-DD", () => {
    const dto = toTransactionDto(fakeRow());
    expect(dto.amount).toBe("12.34");
    expect(dto.date).toBe("2026-01-15");
    expect(dto.category).toEqual({ primary: "FOOD_AND_DRINK", detailed: "FOOD_AND_DRINK_COFFEE" });
  });

  it("passes through nulls", () => {
    const dto = toTransactionDto(fakeRow({ merchantName: null, pfcPrimary: null, pfcDetailed: null }));
    expect(dto.merchantName).toBeNull();
    expect(dto.category).toEqual({ primary: null, detailed: null });
  });
});
