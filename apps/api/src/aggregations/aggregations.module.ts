import { Module } from "@nestjs/common";
import { AggregationsController } from "./aggregations.controller";
import { AggregationsService } from "./aggregations.service";

@Module({
  controllers: [AggregationsController],
  providers: [AggregationsService],
})
export class AggregationsModule {}
