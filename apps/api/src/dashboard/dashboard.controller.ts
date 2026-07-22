import { Body, Controller, Get, Put } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser } from "../auth/supabase-jwt.guard";
import { DashboardService } from "./dashboard.service";
import { UpdateDashboardConfigDto } from "./dto/update-dashboard-config.dto";

@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get("config")
  get(@CurrentUser() user: AuthUser) {
    return this.dashboard.getConfig(user.id);
  }

  @Put("config")
  put(@CurrentUser() user: AuthUser, @Body() dto: UpdateDashboardConfigDto) {
    return this.dashboard.putConfig(user.id, dto);
  }
}
