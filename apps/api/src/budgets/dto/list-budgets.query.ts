import { IsOptional, Matches } from "class-validator";

export class ListBudgetsQuery {
  /** YYYY-MM. Defaults to the current calendar month. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/)
  month?: string;
}
