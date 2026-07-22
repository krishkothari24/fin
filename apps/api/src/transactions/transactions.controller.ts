import { Body, Controller, Delete, Get, Param, Patch, Put, Query } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser } from "../auth/supabase-jwt.guard";
import { ListTransactionsQuery } from "./dto/list-transactions.query";
import { UpdateTransactionDetailDto } from "./dto/update-transaction-detail.dto";
import { SetTransactionSplitsDto } from "./dto/set-transaction-splits.dto";
import { TransactionsService } from "./transactions.service";

@Controller("transactions")
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListTransactionsQuery) {
    return this.transactions.list(user.id, query);
  }

  @Patch(":id")
  updateDetail(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpdateTransactionDetailDto,
  ) {
    return this.transactions.updateDetail(user.id, id, dto);
  }

  @Put(":id/splits")
  setSplits(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: SetTransactionSplitsDto) {
    return this.transactions.setSplits(user.id, id, dto);
  }

  @Delete(":id/splits")
  clearSplits(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.transactions.clearSplits(user.id, id);
  }
}
