import { IsString, MinLength, IsOptional, IsArray, IsIn } from 'class-validator';

export class GeneratePlanDto {
  @IsString()
  @MinLength(2)
  prompt: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsIn(['day', 'week', 'month', 'year'])
  timeRange?: 'day' | 'week' | 'month' | 'year';
}
