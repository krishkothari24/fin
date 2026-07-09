import { Module } from "@nestjs/common";
import { AggregationsModule } from "../aggregations/aggregations.module";
import { BudgetsController } from "./budgets.controller";
import { BudgetsService } from "./budgets.service";

@Module({
  imports: [AggregationsModule],
  controllers: [BudgetsController],
  providers: [BudgetsService],
})
export class BudgetsModule {}
