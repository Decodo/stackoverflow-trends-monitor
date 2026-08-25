import {
  IsString,
  MinLength,
  IsArray,
  IsIn,
  ArrayMinSize,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsMongoId,
} from 'class-validator';

export class AnalyzePlanDto {
  @IsString()
  @MinLength(2)
  prompt: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  keywords: string[];

  @IsArray()
  @IsString({ each: true })
  tags: string[];

  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
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

  @IsOptional()
  @IsMongoId()
  monitorId?: string;
}
