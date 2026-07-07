import { Holding, InvestmentTransaction, Prisma, Security } from "@prisma/client";
import { HoldingDto, InvestmentTransactionDto, SecurityDto } from "@fin/shared";

export function toSecurityDto(s: Security): SecurityDto {
  return {
    id: s.id,
    tickerSymbol: s.tickerSymbol,
    name: s.name,
    type: s.type,
    closePrice: s.closePrice?.toString() ?? null,
    currency: s.currency,
  };
}

/** Map a holding (+ its security) to the API DTO, computing market value gain/loss. */
export function toHoldingDto(h: Holding & { security: Security }): HoldingDto {
  const value = h.institutionValue;
  const gainLoss =
    value != null && h.costBasis != null ? new Prisma.Decimal(value).minus(h.costBasis) : null;
  return {
    id: h.id,
    accountId: h.accountId,
    security: toSecurityDto(h.security),
    quantity: h.quantity.toString(),
    institutionPrice: h.institutionPrice?.toString() ?? null,
    value: value?.toString() ?? null,
    costBasis: h.costBasis?.toString() ?? null,
    gainLoss: gainLoss?.toString() ?? null,
    currency: h.currency,
  };
}

export function toInvestmentTransactionDto(
  t: InvestmentTransaction & { security: Security | null },
): InvestmentTransactionDto {
  return {
    id: t.id,
    accountId: t.accountId,
    security: t.security
      ? { tickerSymbol: t.security.tickerSymbol, name: t.security.name }
      : null,
    type: t.type,
    subtype: t.subtype,
    quantity: t.quantity?.toString() ?? null,
    amount: t.amount.toString(),
    price: t.price?.toString() ?? null,
    fees: t.fees?.toString() ?? null,
    date: t.date.toISOString().slice(0, 10),
    name: t.name,
    currency: t.currency,
  };
}
