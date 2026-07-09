import { Account, Goal, Prisma } from "@prisma/client";
import { GoalDto, GoalKind } from "@fin/shared";

const ZERO = new Prisma.Decimal(0);

/** Map a persisted Goal (+ optional linked account) to the API DTO. Pure. */
export function toGoalDto(g: Goal & { linkedAccount?: Account | null }): GoalDto {
  const kind = g.kind as GoalKind;
  let currentAmount: Prisma.Decimal;
  let currency = "USD";

  if (g.linkedAccount) {
    const balance = g.linkedAccount.currentBalance ?? ZERO;
    currentAmount = kind === "debt_payoff" ? g.targetAmount.minus(balance) : balance;
    currency = g.linkedAccount.currency ?? "USD";
  } else {
    currentAmount = g.currentAmountOverride ?? ZERO;
  }

  const progressPercent = g.targetAmount.isZero() ? 0 : currentAmount.dividedBy(g.targetAmount).times(100).toNumber();

  return {
    id: g.id,
    name: g.name,
    kind,
    targetAmount: g.targetAmount.toString(),
    targetDate: g.targetDate?.toISOString().slice(0, 10) ?? null,
    linkedAccountId: g.linkedAccountId,
    linkedAccountName: g.linkedAccount?.name ?? null,
    currentAmount: currentAmount.toString(),
    progressPercent,
    notes: g.notes,
    currency,
    updatedAt: g.updatedAt.toISOString(),
  };
}
