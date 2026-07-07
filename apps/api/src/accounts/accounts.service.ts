import { Injectable, NotFoundException } from "@nestjs/common";
import { AccountDto } from "@fin/shared";
import { PrismaService } from "../prisma/prisma.service";
import { toAccountDto } from "./account.dto";
import { UpdateAccountDto } from "./dto/update-account.dto";

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  /** All of the user's accounts, across every connected institution. */
  async list(userId: string): Promise<AccountDto[]> {
    const accounts = await this.prisma.account.findMany({
      where: { item: { userId } },
      include: { item: { select: { institutionName: true } } },
      orderBy: [{ item: { institutionName: "asc" } }, { name: "asc" }],
    });
    return accounts.map((a) => toAccountDto(a, a.item.institutionName));
  }

  /** Hide/show or rename one account (must belong to the user). */
  async update(userId: string, id: string, dto: UpdateAccountDto): Promise<AccountDto> {
    const existing = await this.prisma.account.findFirst({
      where: { id, item: { userId } },
      include: { item: { select: { institutionName: true } } },
    });
    if (!existing) throw new NotFoundException("Account not found");

    const updated = await this.prisma.account.update({
      where: { id },
      data: { isHidden: dto.isHidden, name: dto.name },
    });
    return toAccountDto(updated, existing.item.institutionName);
  }
}
