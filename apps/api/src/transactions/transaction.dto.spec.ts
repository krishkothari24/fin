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

  it("defaults note/tags/splits when there's no detail row", () => {
    const dto = toTransactionDto(fakeRow());
    expect(dto.note).toBeNull();
    expect(dto.tags).toEqual([]);
    expect(dto.splits).toEqual([]);
  });

  it("prefers the category override over Plaid's pfcPrimary", () => {
    const row = fakeRow();
    const dto = toTransactionDto({
      ...row,
      detail: {
        id: "d1",
        transactionId: row.id,
        note: "birthday gift",
        categoryOverride: "ENTERTAINMENT",
        tags: ["gift", "annual"],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    expect(dto.category.primary).toBe("ENTERTAINMENT");
    expect(dto.category.detailed).toBe("FOOD_AND_DRINK_COFFEE"); // detailed is never overridden
    expect(dto.note).toBe("birthday gift");
    expect(dto.tags).toEqual(["gift", "annual"]);
  });

  it("maps splits, stringifying their decimal amounts", () => {
    const row = fakeRow();
    const dto = toTransactionDto({
      ...row,
      splits: [
        {
          id: "s1",
          transactionId: row.id,
          amount: new Prisma.Decimal("5.0000"),
          categoryOverride: "FOOD_AND_DRINK",
          note: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "s2",
          transactionId: row.id,
          amount: new Prisma.Decimal("7.3400"),
          categoryOverride: null,
          note: "tip",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
    expect(dto.splits).toEqual([
      { id: "s1", amount: "5", category: "FOOD_AND_DRINK", note: null },
      { id: "s2", amount: "7.34", category: null, note: "tip" },
    ]);
  });
});
