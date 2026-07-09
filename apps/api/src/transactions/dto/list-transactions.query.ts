import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from "class-validator";

/** Query params for GET /transactions. All optional; sensible defaults applied. */
export class ListTransactionsQuery {
  /** Inclusive lower bound, YYYY-MM-DD. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "startDate must be YYYY-MM-DD" })
  startDate?: string;

  /** Inclusive upper bound, YYYY-MM-DD. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "endDate must be YYYY-MM-DD" })
  endDate?: string;

  @IsOptional()
  @IsUUID()
  accountId?: string;

  /** Filter by Plaid primary category (pfc_primary). */
  @IsOptional()
  @IsString()
  category?: string;

  /** Substring match on name / merchant name (case-insensitive). */
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  pending?: boolean;

  /** Comma-separated tag names; matches transactions with any of them. */
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.split(",").filter(Boolean) : value))
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0;
}
