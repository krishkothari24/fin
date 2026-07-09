import { IsNumberString } from "class-validator";

/** Set (create or replace) the monthly limit for one category. */
export class UpsertBudgetDto {
  @IsNumberString()
  monthlyLimit!: string;
}
