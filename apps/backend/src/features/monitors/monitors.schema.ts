import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MonitorDocument = HydratedDocument<Monitor>;

@Schema({ timestamps: true })
export class Monitor {
  @Prop({ required: true })
  name: string;

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

  @Prop({ required: true, enum: ['test-3-minutes', 'custom-hours', 'daily', 'weekly', 'monthly'] })
  cadence: 'test-3-minutes' | 'custom-hours' | 'daily' | 'weekly' | 'monthly';

  @Prop({ type: Number })
  intervalHours?: number;

  @Prop({ default: true })
  enabled: boolean;

  @Prop({ type: Date, required: true })
  nextRunAt: Date;

  @Prop({ type: Date })
  lastRunAt?: Date;

  @Prop({ type: String })
  lastQueryId?: string;

  @Prop({ type: String })
  lastError?: string;
}

export const MonitorSchema = SchemaFactory.createForClass(Monitor);
