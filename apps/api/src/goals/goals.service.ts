import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { GoalDto } from "@fin/shared";
import { PrismaService } from "../prisma/prisma.service";
import { toGoalDto } from "./goal.dto";
import { CreateGoalDto } from "./dto/create-goal.dto";
import { UpdateGoalDto } from "./dto/update-goal.dto";

const INCLUDE = { linkedAccount: true } as const;

@Injectable()
export class GoalsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<GoalDto[]> {
    const rows = await this.prisma.goal.findMany({
      where: { userId },
      include: INCLUDE,
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toGoalDto);
  }

  async create(userId: string, dto: CreateGoalDto): Promise<GoalDto> {
    await this.ensureProfile(userId);
    if (dto.linkedAccountId) await this.assertAccountOwned(userId, dto.linkedAccountId);

    const created = await this.prisma.goal.create({
      data: {
        userId,
        name: dto.name,
        kind: dto.kind,
        targetAmount: new Prisma.Decimal(dto.targetAmount),
        targetDate: dto.targetDate ? new Date(`${dto.targetDate}T00:00:00.000Z`) : undefined,
        linkedAccountId: dto.linkedAccountId,
        currentAmountOverride:
          dto.currentAmountOverride !== undefined ? new Prisma.Decimal(dto.currentAmountOverride) : undefined,
        notes: dto.notes,
      },
      include: INCLUDE,
    });
    return toGoalDto(created);
  }

  async update(userId: string, id: string, dto: UpdateGoalDto): Promise<GoalDto> {
    await this.findOwned(userId, id);
    if (dto.linkedAccountId) await this.assertAccountOwned(userId, dto.linkedAccountId);

    const updated = await this.prisma.goal.update({
      where: { id },
      data: {
        name: dto.name,
        kind: dto.kind,
        targetAmount: dto.targetAmount !== undefined ? new Prisma.Decimal(dto.targetAmount) : undefined,
        targetDate: dto.targetDate ? new Date(`${dto.targetDate}T00:00:00.000Z`) : undefined,
        // An empty string explicitly unlinks; undefined leaves it untouched.
        linkedAccountId: dto.linkedAccountId === "" ? null : dto.linkedAccountId,
        currentAmountOverride:
          dto.currentAmountOverride !== undefined ? new Prisma.Decimal(dto.currentAmountOverride) : undefined,
        notes: dto.notes,
      },
      include: INCLUDE,
    });
    return toGoalDto(updated);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOwned(userId, id);
    await this.prisma.goal.delete({ where: { id } });
  }

  private async findOwned(userId: string, id: string) {
    const goal = await this.prisma.goal.findFirst({ where: { id, userId } });
    if (!goal) throw new NotFoundException("Goal not found");
    return goal;
  }

  /** Linking someone else's account would leak their balance into this user's goal progress. */
  private async assertAccountOwned(userId: string, accountId: string): Promise<void> {
    const account = await this.prisma.account.findFirst({ where: { id: accountId, item: { userId } } });
    if (!account) throw new NotFoundException("Account not found");
  }

  private async ensureProfile(userId: string): Promise<void> {
    await this.prisma.profile.upsert({ where: { id: userId }, create: { id: userId }, update: {} });
  }
}
