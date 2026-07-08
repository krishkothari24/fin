import { Controller, Get, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser, SupabaseJwtGuard } from "../auth/supabase-jwt.guard";
import { LiabilitiesService } from "./liabilities.service";

/** Read API for Plaid Liabilities: card / loan detail (APR, due dates, min payment). */
@UseGuards(SupabaseJwtGuard)
@Controller("liabilities")
export class LiabilitiesController {
  constructor(private readonly liabilities: LiabilitiesService) {}

  /** All liabilities (hidden accounts excluded) + total debt / minimum payment due. */
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.liabilities.listLiabilities(user.id);
  }
}
