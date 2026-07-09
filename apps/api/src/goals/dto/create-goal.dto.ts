import { GoalKind } from "@fin/shared";
import { IsIn, IsISO8601, IsNumberString, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

const GOAL_KINDS: GoalKind[] = ["savings", "debt_payoff"];

export class CreateGoalDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsIn(GOAL_KINDS)
  kind!: GoalKind;

  @IsNumberString()
  targetAmount!: string;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: "targetDate must be YYYY-MM-DD" })
  targetDate?: string;

  @IsOptional()
  @IsUUID()
  linkedAccountId?: string;

  @IsOptional()
  @IsNumberString()
  currentAmountOverride?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
