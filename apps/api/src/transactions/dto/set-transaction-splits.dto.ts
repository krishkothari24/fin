import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsNumberString, IsOptional, IsString, MaxLength, ValidateNested } from "class-validator";

class SplitLineDto {
  @IsNumberString()
  amount!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

/** PUT /transactions/:id/splits body — full replacement set, must sum to the transaction's amount. */
export class SetTransactionSplitsDto {
  @IsArray()
  @ArrayMinSize(2) // fewer than 2 lines isn't a "split"
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SplitLineDto)
  splits!: SplitLineDto[];
}
