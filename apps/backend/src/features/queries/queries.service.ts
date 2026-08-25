import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Query, QueryDocument } from './queries.schema';
import type { StackOverflowReport } from '../llm/llm.types';
import type { StackOverflowQuestion } from '../decodo/decodo.types';
import type { ResearchSignals, TrendStat } from '../llm/llm.types';

export interface CreateQueryDto {
  prompt: string;
  plan: {
    prompt: string;
    keywords: string[];
    tags: string[];
    queries: string[];
    timeRange: 'day' | 'week' | 'month' | 'year';
    maxPosts?: number;
    researchDepth?: 'focused' | 'standard' | 'thorough' | 'comprehensive';
  };
  posts: StackOverflowQuestion[];
  trendStats: TrendStat[];
  researchSignals?: ResearchSignals;
  report: StackOverflowReport;
  monitorId?: string;
  runType?: 'manual' | 'scheduled' | 'manual-monitor';
}

@Injectable()
export class QueriesService {
  constructor(@InjectModel(Query.name) private readonly queryModel: Model<QueryDocument>) {}

  async create(dto: CreateQueryDto): Promise<QueryDocument> {
    const query = new this.queryModel(dto);
    return query.save();
  }

  async findAll(): Promise<QueryDocument[]> {
    return this.queryModel.find().select('-posts').sort({ createdAt: -1 }).exec();
  }

  async findRecentHistory(prompt: string, monitorId?: string, limit = 8): Promise<QueryDocument[]> {
    const filter = monitorId ? { monitorId } : { prompt: { $regex: `^${prompt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } };
    return this.queryModel.find(filter).sort({ createdAt: -1 }).limit(limit).exec();
  }

  async findOne(id: string): Promise<QueryDocument> {
    const query = await this.queryModel.findById(id).exec();
    if (!query) throw new NotFoundException(`Query ${id} not found`);
    return query;
  }

  async remove(id: string): Promise<void> {
    const result = await this.queryModel.findByIdAndDelete(id).exec();
    if (!result) throw new NotFoundException(`Query ${id} not found`);
  }
}
