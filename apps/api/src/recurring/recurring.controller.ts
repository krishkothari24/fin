import { Controller, Get, Query } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser } from "../auth/supabase-jwt.guard";
import { ListRecurringQuery } from "./dto/list-recurring.query";
import { RecurringService } from "./recurring.service";

/** Read API for Plaid Recurring Transactions: detected subscriptions / bills / paychecks. */
@Controller("recurring")
export class RecurringController {
  constructor(private readonly recurring: RecurringService) {}

  /** Recurring streams split into inflows / outflows, with monthly run-rate totals. */
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListRecurringQuery) {
    return this.recurring.listRecurring(user.id, query);
  }
}
