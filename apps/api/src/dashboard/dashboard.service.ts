import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { DashboardConfig, DEFAULT_DASHBOARD_CONFIG } from "@fin/shared";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateDashboardConfigDto } from "./dto/update-dashboard-config.dto";

/**
 * Per-user dashboard preferences ("choose what to show"). Stored as a JSONB blob
 * in dashboard_configs; a user with no saved config gets DEFAULT_DASHBOARD_CONFIG.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig(userId: string): Promise<DashboardConfig> {
    const row = await this.prisma.dashboardConfig.findUnique({ where: { userId } });
    const stored = row?.config as unknown as Partial<DashboardConfig> | undefined;
    // Fall back to defaults if there's no row or the blob is malformed/empty.
    if (!stored || !Array.isArray(stored.widgets)) return DEFAULT_DASHBOARD_CONFIG;
    return stored as DashboardConfig;
  }

  async putConfig(userId: string, dto: UpdateDashboardConfigDto): Promise<DashboardConfig> {
    await this.ensureProfile(userId); // dashboard_configs.user_id FK -> profiles.id
    const config = dto as unknown as Prisma.InputJsonValue;
    await this.prisma.dashboardConfig.upsert({
      where: { userId },
      create: { userId, config },
      update: { config },
    });
    return dto as unknown as DashboardConfig;
  }

  private async ensureProfile(userId: string): Promise<void> {
    await this.prisma.profile.upsert({ where: { id: userId }, create: { id: userId }, update: {} });
  }
}
