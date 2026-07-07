import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser, SupabaseJwtGuard } from "../auth/supabase-jwt.guard";
import { ExchangePublicTokenDto } from "./dto/exchange-public-token.dto";
import { ItemsService } from "./items.service";

/**
 * The Plaid Link flow: get a link_token, then exchange the resulting public_token.
 * These hit Plaid on every call, so they carry a tighter cap (15/min per IP) than
 * the global read budget.
 */
@Throttle({ default: { limit: 15, ttl: 60_000 } })
@UseGuards(SupabaseJwtGuard)
@Controller("plaid")
export class PlaidLinkController {
  constructor(private readonly items: ItemsService) {}

  @Post("link-token")
  createLinkToken(@CurrentUser() user: AuthUser) {
    return this.items.createLinkToken(user.id);
  }

  @Post("exchange")
  exchange(@CurrentUser() user: AuthUser, @Body() dto: ExchangePublicTokenDto) {
    return this.items.exchangeAndStore(user.id, dto.publicToken);
  }
}
