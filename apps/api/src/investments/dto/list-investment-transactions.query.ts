import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min } from "class-validator";

/** Query params for GET /investments/transactions. All optional. */
export class ListInvestmentTransactionsQuery {
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

  /** Filter by Plaid investment-transaction type (buy | sell | cash | fee | transfer | cancel). */
  @IsOptional()
  @IsString()
  type?: string;

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
