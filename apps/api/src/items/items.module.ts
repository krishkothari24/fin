import { Module } from "@nestjs/common";
import { PlaidModule } from "../plaid/plaid.module";
import { SyncModule } from "../sync/sync.module";
import { ItemsController } from "./items.controller";
import { ItemsService } from "./items.service";
import { PlaidLinkController } from "./plaid-link.controller";

@Module({
  imports: [PlaidModule, SyncModule],
  controllers: [PlaidLinkController, ItemsController],
  providers: [ItemsService],
  exports: [ItemsService],
})
export class ItemsModule {}
