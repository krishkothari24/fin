import { Body, Controller, Get, Param, Patch } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser } from "../auth/supabase-jwt.guard";
import { AccountsService } from "./accounts.service";
import { UpdateAccountDto } from "./dto/update-account.dto";

@Controller("accounts")
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.accounts.list(user.id);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.accounts.update(user.id, id, dto);
  }
}
