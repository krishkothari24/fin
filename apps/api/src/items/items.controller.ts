import { Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { SkipUserContext } from "../auth/skip-user-context.decorator";
import { AuthUser } from "../auth/supabase-jwt.guard";
import { ItemsService } from "./items.service";

/**
 * Managing already-connected institutions (Items) for the signed-in user.
 * @SkipUserContext: these call Plaid (or run PrismaOwnerService-backed
 * ItemsService), so they're exempt from the per-request RLS transaction — see
 * ItemsService's doc comment.
 */
@SkipUserContext()
@Controller("items")
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.items.listItems(user.id);
  }

  /** Link update-mode token to fix an item stuck in login_required. */
  @Post(":id/reauth-token")
  reauth(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.items.createReauthLinkToken(user.id, id);
  }

  @Post(":id/refresh")
  refresh(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.items.refreshBalances(user.id, id);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.items.removeItem(user.id, id);
  }
}
