import { MANUAL_ASSET_CATEGORIES, ManualAssetCategory, ManualAssetKind } from "@fin/shared";
import { IsIn, IsNumberString, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

const MANUAL_ASSET_KINDS: ManualAssetKind[] = ["asset", "liability"];

/** Partial edit of a manual asset/liability — every field optional. */
export class UpdateManualAssetDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsIn(MANUAL_ASSET_KINDS)
  kind?: ManualAssetKind;

  @IsOptional()
  @IsIn(MANUAL_ASSET_CATEGORIES)
  category?: ManualAssetCategory;

  @IsOptional()
  @IsNumberString()
  currentValue?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
