import { Account, Goal, Prisma } from "@prisma/client";
import { toGoalDto } from "./goal.dto";

function fakeGoal(over: Partial<Goal> = {}): Goal {
  return {
    id: "goal-1",
    userId: "user-1",
    name: "Emergency fund",
    kind: "savings",
    targetAmount: new Prisma.Decimal("10000.0000"),
    targetDate: null,
    linkedAccountId: null,
    currentAmountOverride: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date("2026-07-08T00:00:00.000Z"),
    ...over,
  } as Goal;
}

function fakeAccount(over: Partial<Account> = {}): Account {
  return {
    id: "acct-1",
    itemId: "item-1",
    plaidAccountId: "plaid-acct-1",
    name: "Savings",
    officialName: null,
    mask: "1111",
    type: "depository",
    subtype: "savings",
    currentBalance: new Prisma.Decimal("2500.0000"),
    availableBalance: null,
    currency: "USD",
    isHidden: false,
    updatedAt: new Date(),
    ...over,
  } as Account;
}

describe("toGoalDto", () => {
  it("uses currentAmountOverride when there's no linked account", () => {
    const dto = toGoalDto(fakeGoal({ currentAmountOverride: new Prisma.Decimal("3000") }));
    expect(dto.currentAmount).toBe("3000");
    expect(dto.progressPercent).toBeCloseTo(30, 5);
    expect(dto.linkedAccountId).toBeNull();
  });

  it("defaults to zero when unlinked and no override set", () => {
    const dto = toGoalDto(fakeGoal());
    expect(dto.currentAmount).toBe("0");
    expect(dto.progressPercent).toBe(0);
  });

  it("savings goal: currentAmount tracks the linked account's live balance", () => {
    const goal = fakeGoal({ linkedAccountId: "acct-1" });
    const dto = toGoalDto({ ...goal, linkedAccount: fakeAccount({ currentBalance: new Prisma.Decimal("4000") }) });
    expect(dto.currentAmount).toBe("4000");
    expect(dto.progressPercent).toBeCloseTo(40, 5);
    expect(dto.linkedAccountName).toBe("Savings");
  });

  it("debt_payoff goal: currentAmount is the amount paid down, not the balance", () => {
    const goal = fakeGoal({ kind: "debt_payoff", targetAmount: new Prisma.Decimal("5000"), linkedAccountId: "acct-1" });
    const dto = toGoalDto({ ...goal, linkedAccount: fakeAccount({ currentBalance: new Prisma.Decimal("2000") }) });
    // paid down = target (5000) - remaining balance (2000) = 3000
    expect(dto.currentAmount).toBe("3000");
    expect(dto.progressPercent).toBeCloseTo(60, 5);
  });
});
