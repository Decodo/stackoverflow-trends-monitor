import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateMonitorDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsIn(['custom-hours', 'daily', 'weekly', 'monthly'])
  cadence?: 'custom-hours' | 'daily' | 'weekly' | 'monthly';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  intervalHours?: number;
}
