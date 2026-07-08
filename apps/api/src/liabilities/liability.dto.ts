import { Account, Liability } from "@prisma/client";
import { LiabilityDto, LiabilityKind } from "@fin/shared";

/** Map a liability (+ its account) to the API DTO. Outstanding balance comes from the account. */
export function toLiabilityDto(l: Liability & { account: Account }): LiabilityDto {
  return {
    id: l.id,
    accountId: l.accountId,
    accountName: l.account.name,
    mask: l.account.mask,
    kind: l.kind as LiabilityKind,
    currentBalance: l.account.currentBalance?.toString() ?? null,
    aprPercentage: l.aprPercentage?.toString() ?? null,
    lastPaymentAmount: l.lastPaymentAmount?.toString() ?? null,
    lastPaymentDate: l.lastPaymentDate?.toISOString().slice(0, 10) ?? null,
    lastStatementBalance: l.lastStatementBalance?.toString() ?? null,
    lastStatementIssueDate: l.lastStatementIssueDate?.toISOString().slice(0, 10) ?? null,
    minimumPaymentAmount: l.minimumPaymentAmount?.toString() ?? null,
    nextPaymentDueDate: l.nextPaymentDueDate?.toISOString().slice(0, 10) ?? null,
    isOverdue: l.isOverdue,
    currency: l.account.currency,
  };
}
