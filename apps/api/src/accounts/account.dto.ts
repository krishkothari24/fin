import { Account } from "@prisma/client";
import { AccountDto } from "@fin/shared";

/** Map a persisted Account (+ its institution name) to the API DTO. Pure. */
export function toAccountDto(a: Account, institutionName: string | null): AccountDto {
  return {
    id: a.id,
    name: a.name,
    officialName: a.officialName,
    mask: a.mask,
    type: a.type,
    subtype: a.subtype,
    currentBalance: a.currentBalance?.toString() ?? null,
    availableBalance: a.availableBalance?.toString() ?? null,
    currency: a.currency,
    isHidden: a.isHidden,
    institutionName,
  };
}
