import { Prisma } from "@prisma/client";
import { BudgetsService } from "./budgets.service";

describe("BudgetsService.list percentUsed math", () => {
  it("computes percentUsed and remaining from budget rows + spend map (via upsert's response shape)", async () => {
    const prisma = {
      budget: {
        findMany: jest.fn().mockResolvedValue([
          { id: "b1", userId: "u1", category: "FOOD_AND_DRINK", monthlyLimit: new Prisma.Decimal("500"), currency: "USD" },
        ]),
      },
      profile: { upsert: jest.fn() },
    } as never;
    const aggregations = {
      spendingByCategory: jest.fn().mockResolvedValue([{ category: "FOOD_AND_DRINK", amount: "125.50" }]),
    } as never;

    const service = new BudgetsService(prisma, aggregations);
    const result = await service.list("u1", "2026-07");

    expect(result.month).toBe("2026-07");
    expect(result.budgets).toHaveLength(1);
    expect(result.budgets[0].spent).toBe("125.5");
    expect(result.budgets[0].remaining).toBe("374.5");
    expect(result.budgets[0].percentUsed).toBeCloseTo(25.1, 5);
  });

  it("treats a category with no spend this month as zero", async () => {
    const prisma = {
      budget: {
        findMany: jest.fn().mockResolvedValue([
          { id: "b1", userId: "u1", category: "TRAVEL", monthlyLimit: new Prisma.Decimal("200"), currency: "USD" },
        ]),
      },
      profile: { upsert: jest.fn() },
    } as never;
    const aggregations = { spendingByCategory: jest.fn().mockResolvedValue([]) } as never;

    const service = new BudgetsService(prisma, aggregations);
    const result = await service.list("u1", "2026-07");

    expect(result.budgets[0].spent).toBe("0");
    expect(result.budgets[0].percentUsed).toBe(0);
  });
});
