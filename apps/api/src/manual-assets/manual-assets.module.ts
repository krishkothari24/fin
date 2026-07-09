import { Module } from "@nestjs/common";
import { ManualAssetsController } from "./manual-assets.controller";
import { ManualAssetsService } from "./manual-assets.service";

@Module({
  controllers: [ManualAssetsController],
  providers: [ManualAssetsService],
  exports: [ManualAssetsService],
})
export class ManualAssetsModule {}
