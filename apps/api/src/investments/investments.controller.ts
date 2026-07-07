import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser, SupabaseJwtGuard } from "../auth/supabase-jwt.guard";
import { ListInvestmentTransactionsQuery } from "./dto/list-investment-transactions.query";
import { InvestmentsService } from "./investments.service";

/** Read API for Plaid Investments: current holdings + investment transactions. */
@UseGuards(SupabaseJwtGuard)
@Controller("investments")
export class InvestmentsController {
  constructor(private readonly investments: InvestmentsService) {}

  /** Current positions (hidden accounts excluded) + portfolio value/cost-basis/gain. */
  @Get("holdings")
  holdings(@CurrentUser() user: AuthUser) {
    return this.investments.listHoldings(user.id);
  }

  /** Buys / sells / dividends / fees / transfers, filtered + paginated. */
  @Get("transactions")
  transactions(@CurrentUser() user: AuthUser, @Query() query: ListInvestmentTransactionsQuery) {
    return this.investments.listInvestmentTransactions(user.id, query);
  }
}
