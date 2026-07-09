import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser, SupabaseJwtGuard } from "../auth/supabase-jwt.guard";
import { ManualAssetsService } from "./manual-assets.service";
import { CreateManualAssetDto } from "./dto/create-manual-asset.dto";
import { UpdateManualAssetDto } from "./dto/update-manual-asset.dto";

/** CRUD for user-entered, off-platform net-worth items (not synced from Plaid). */
@UseGuards(SupabaseJwtGuard)
@Controller("manual-assets")
export class ManualAssetsController {
  constructor(private readonly manualAssets: ManualAssetsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.manualAssets.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateManualAssetDto) {
    return this.manualAssets.create(user.id, dto);
  }

  @Patch(":id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateManualAssetDto) {
    return this.manualAssets.update(user.id, id, dto);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.manualAssets.remove(user.id, id);
  }
}
