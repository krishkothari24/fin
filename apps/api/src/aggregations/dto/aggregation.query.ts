import { Transform } from "class-transformer";
import { IsBoolean, IsOptional, Matches } from "class-validator";

export class DateRangeQuery {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "startDate must be YYYY-MM-DD" })
  startDate?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "endDate must be YYYY-MM-DD" })
  endDate?: string;
}

export class NetWorthQuery {
  /** Include the net-worth-over-time series (from balance_snapshots). */
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  series?: boolean;
}
