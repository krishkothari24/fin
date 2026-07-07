import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/** User edits to an account: hide/show it, or rename it on the dashboard. */
export class UpdateAccountDto {
  @IsOptional()
  @IsBoolean()
  isHidden?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;
}
