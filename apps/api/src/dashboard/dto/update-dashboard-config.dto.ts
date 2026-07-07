import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import { WidgetId, WIDGET_IDS } from "@fin/shared";

class WidgetConfigDto {
  @IsIn(WIDGET_IDS)
  id!: WidgetId;

  @IsBoolean()
  enabled!: boolean;

  @IsInt()
  @Min(0)
  order!: number;
}

/** Body for PUT /dashboard/config. Mirrors DashboardConfig in @fin/shared. */
export class UpdateDashboardConfigDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => WidgetConfigDto)
  widgets!: WidgetConfigDto[];

  @IsArray()
  @ArrayMaxSize(1000)
  @IsUUID("all", { each: true })
  hiddenAccountIds!: string[];

  @IsInt()
  @Min(1)
  @Max(365)
  defaultRangeDays!: number;

  @IsString()
  @Length(3, 3)
  currency!: string;
}
