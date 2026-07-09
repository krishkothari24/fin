import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from "class-validator";

/**
 * User edits to one transaction. All fields optional (PATCH semantics) — a field
 * that's absent from the body is left untouched; a field explicitly sent as
 * `null` clears it (checked via `!== undefined` in the service, not here).
 */
export class UpdateTransactionDetailDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  categoryOverride?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(30, { each: true })
  tags?: string[];
}
