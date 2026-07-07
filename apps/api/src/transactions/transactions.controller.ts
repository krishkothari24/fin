import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser, SupabaseJwtGuard } from "../auth/supabase-jwt.guard";
import { ListTransactionsQuery } from "./dto/list-transactions.query";
import { TransactionsService } from "./transactions.service";

@UseGuards(SupabaseJwtGuard)
@Controller("transactions")
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListTransactionsQuery) {
    return this.transactions.list(user.id, query);
  }
}
