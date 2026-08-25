import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { StackOverflowReport } from '../llm/llm.types';
import type { StackOverflowQuestion } from '../decodo/decodo.types';

export type QueryDocument = HydratedDocument<Query>;

@Schema({ timestamps: true })
export class Query {
  @Prop({ required: true })
  prompt: string;

  @Prop({ type: Object, required: true })
  plan: {
    prompt: string;
    keywords: string[];
    tags: string[];
    queries: string[];
    timeRange: 'day' | 'week' | 'month' | 'year';
    maxPosts?: number;
    researchDepth?: 'focused' | 'standard' | 'thorough' | 'comprehensive';
  };

  @Prop({ type: Array, default: [] })
  posts: StackOverflowQuestion[];

  @Prop({ type: Array, default: [] })
  trendStats: Array<{
    query: string;
    currentCount: number;
    previousCount: number;
    currentIsLowerBound?: boolean;
    previousIsLowerBound?: boolean;
    comparisonStatus?: 'comparable' | 'lower-bound' | 'new-activity' | 'unavailable' | 'low-volume';
    changePercent: number | null;
  }>;

  @Prop({ type: Object })
  researchSignals?: Record<string, unknown>;

  @Prop({ type: Object, required: true })
  report: StackOverflowReport;

  @Prop({ type: String, index: true })
  monitorId?: string;

  @Prop({ type: String, enum: ['manual', 'scheduled', 'manual-monitor'], default: 'manual' })
  runType: 'manual' | 'scheduled' | 'manual-monitor';
}

export const QuerySchema = SchemaFactory.createForClass(Query);
