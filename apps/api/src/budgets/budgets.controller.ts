import { Body, Controller, Delete, Get, Param, Put, Query } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser } from "../auth/supabase-jwt.guard";
import { BudgetsService } from "./budgets.service";
import { UpsertBudgetDto } from "./dto/upsert-budget.dto";
import { ListBudgetsQuery } from "./dto/list-budgets.query";

/** Monthly spend limit per Plaid category, merged with that month's actual spend. */
@Controller("budgets")
export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListBudgetsQuery) {
    return this.budgets.list(user.id, query.month);
  }

  @Put(":category")
  upsert(@CurrentUser() user: AuthUser, @Param("category") category: string, @Body() dto: UpsertBudgetDto) {
    return this.budgets.upsert(user.id, category, dto.monthlyLimit);
  }

  @Delete(":category")
  remove(@CurrentUser() user: AuthUser, @Param("category") category: string) {
    return this.budgets.remove(user.id, category);
  }
}
