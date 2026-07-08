import { Transform } from "class-transformer";
import { IsBoolean, IsOptional, IsUUID } from "class-validator";

/** Query params for GET /recurring. All optional. */
export class ListRecurringQuery {
  /** Only return active streams (default true). Pass `activeOnly=false` for all. */
  @IsOptional()
  @Transform(({ value }) => value !== "false" && value !== false)
  @IsBoolean()
  activeOnly: boolean = true;

  @IsOptional()
  @IsUUID()
  accountId?: string;
}
