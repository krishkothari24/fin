import { MANUAL_ASSET_CATEGORIES, ManualAssetCategory, ManualAssetKind } from "@fin/shared";
import { IsIn, IsNumberString, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

const MANUAL_ASSET_KINDS: ManualAssetKind[] = ["asset", "liability"];

/** A user-entered, off-platform net-worth item (house, car, cash, crypto, manual debt…). */
export class CreateManualAssetDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsIn(MANUAL_ASSET_KINDS)
  kind!: ManualAssetKind;

  @IsIn(MANUAL_ASSET_CATEGORIES)
  category!: ManualAssetCategory;

  @IsNumberString()
  currentValue!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
