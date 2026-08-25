import { IsIn, IsOptional } from 'class-validator';

export class AnalyzeTrendingDto {
  @IsOptional()
  @IsIn(['focused', 'standard', 'thorough', 'comprehensive'])
  researchDepth?: 'focused' | 'standard' | 'thorough' | 'comprehensive';
}
