import { IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class CreateMonitorDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(2)
  prompt: string;

  @IsArray()
  @IsString({ each: true })
  keywords: string[];

  @IsArray()
  @IsString({ each: true })
  tags: string[];

  @IsArray()
  @IsString({ each: true })
  queries: string[];

  @IsIn(['day', 'week', 'month', 'year'])
  timeRange: 'day' | 'week' | 'month' | 'year';

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(60)
  maxPosts?: number;

  @IsOptional()
  @IsIn(['focused', 'standard', 'thorough', 'comprehensive'])
  researchDepth?: 'focused' | 'standard' | 'thorough' | 'comprehensive';

  @IsIn(['custom-hours', 'daily', 'weekly', 'monthly'])
  cadence: 'custom-hours' | 'daily' | 'weekly' | 'monthly';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  intervalHours?: number;
}
