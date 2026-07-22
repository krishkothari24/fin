import { Controller, Get, Query } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser } from "../auth/supabase-jwt.guard";
import { AggregationsService } from "./aggregations.service";
import { DateRangeQuery, NetWorthQuery } from "./dto/aggregation.query";

@Controller("aggregations")
export class AggregationsController {
  constructor(private readonly aggregations: AggregationsService) {}

  @Get("net-worth")
  netWorth(@CurrentUser() user: AuthUser, @Query() query: NetWorthQuery) {
    return this.aggregations.netWorth(user.id, query.series ?? false);
  }

  @Get("spending")
  spending(@CurrentUser() user: AuthUser, @Query() query: DateRangeQuery) {
    return this.aggregations.spendingByCategory(user.id, query.startDate, query.endDate);
  }

  @Get("cash-flow")
  cashFlow(@CurrentUser() user: AuthUser, @Query() query: DateRangeQuery) {
    return this.aggregations.cashFlow(user.id, query.startDate, query.endDate);
  }
}
