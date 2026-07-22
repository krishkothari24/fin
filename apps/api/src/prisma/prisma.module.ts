import { Global, Module } from "@nestjs/common";
import { PrismaOwnerService } from "./prisma-owner.service";
import { PrismaService } from "./prisma.service";

@Global()
@Module({
  providers: [PrismaService, PrismaOwnerService],
  exports: [PrismaService, PrismaOwnerService],
})
export class PrismaModule {}
