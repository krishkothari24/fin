import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ManualAssetDto, ManualAssetsResponse } from "@fin/shared";
import { PrismaService } from "../prisma/prisma.service";
import { toManualAssetDto } from "./manual-asset.dto";
import { CreateManualAssetDto } from "./dto/create-manual-asset.dto";
import { UpdateManualAssetDto } from "./dto/update-manual-asset.dto";

@Injectable()
export class ManualAssetsService {
  constructor(private readonly prisma: PrismaService) {}

  /** All of the user's manual entries, split by kind, plus net totals. */
  async list(userId: string): Promise<ManualAssetsResponse> {
    const rows = await this.prisma.manualAsset.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });

    let assetsValue = new Prisma.Decimal(0);
    let liabilitiesValue = new Prisma.Decimal(0);
    let currency = "USD";
    const assets: ManualAssetDto[] = [];
    const liabilities: ManualAssetDto[] = [];
    for (const row of rows) {
      const dto = toManualAssetDto(row);
      if (row.currency) currency = row.currency;
      if (row.kind === "liability") {
        liabilities.push(dto);
        liabilitiesValue = liabilitiesValue.plus(row.currentValue);
      } else {
        assets.push(dto);
        assetsValue = assetsValue.plus(row.currentValue);
      }
    }

    return {
      assets,
      liabilities,
      totals: { assetsValue: assetsValue.toString(), liabilitiesValue: liabilitiesValue.toString(), currency },
    };
  }

  async create(userId: string, dto: CreateManualAssetDto): Promise<ManualAssetDto> {
    await this.ensureProfile(userId);
    const created = await this.prisma.manualAsset.create({
      data: {
        userId,
        name: dto.name,
        kind: dto.kind,
        category: dto.category,
        currentValue: new Prisma.Decimal(dto.currentValue),
        currency: dto.currency,
        notes: dto.notes,
      },
    });
    return toManualAssetDto(created);
  }

  async update(userId: string, id: string, dto: UpdateManualAssetDto): Promise<ManualAssetDto> {
    const existing = await this.prisma.manualAsset.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException("Manual asset not found");

    const updated = await this.prisma.manualAsset.update({
      where: { id },
      data: {
        name: dto.name,
        kind: dto.kind,
        category: dto.category,
        currentValue: dto.currentValue !== undefined ? new Prisma.Decimal(dto.currentValue) : undefined,
        currency: dto.currency,
        notes: dto.notes,
      },
    });
    return toManualAssetDto(updated);
  }

  async remove(userId: string, id: string): Promise<void> {
    const existing = await this.prisma.manualAsset.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException("Manual asset not found");
    await this.prisma.manualAsset.delete({ where: { id } });
  }

  private async ensureProfile(userId: string): Promise<void> {
    await this.prisma.profile.upsert({ where: { id: userId }, create: { id: userId }, update: {} });
  }
}
