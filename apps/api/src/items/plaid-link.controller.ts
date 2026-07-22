import { Body, Controller, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser } from "../auth/current-user.decorator";
import { SkipUserContext } from "../auth/skip-user-context.decorator";
import { AuthUser } from "../auth/supabase-jwt.guard";
import { ExchangePublicTokenDto } from "./dto/exchange-public-token.dto";
import { ItemsService } from "./items.service";

/**
 * The Plaid Link flow: get a link_token, then exchange the resulting public_token.
 * These hit Plaid on every call, so they carry a tighter cap (15/min per IP) than
 * the global read budget. @SkipUserContext: see ItemsService's doc comment.
 */
@SkipUserContext()
@Throttle({ default: { limit: 15, ttl: 60_000 } })
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
