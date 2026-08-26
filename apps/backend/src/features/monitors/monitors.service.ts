import { Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Monitor, MonitorDocument } from './monitors.schema';
import { CreateMonitorDto } from './dto/create-monitor.dto';
import { UpdateMonitorDto } from './dto/update-monitor.dto';
import { TrackerService } from '../tracker/tracker.service';

function nextRun(
  cadence: 'custom-hours' | 'daily' | 'weekly' | 'monthly',
  from = new Date(),
  intervalHours?: number,
): Date {
  const date = new Date(from);
  if (cadence === 'custom-hours') date.setHours(date.getHours() + Math.max(1, intervalHours ?? 1));
  if (cadence === 'daily') date.setDate(date.getDate() + 1);
  if (cadence === 'weekly') date.setDate(date.getDate() + 7);
  if (cadence === 'monthly') date.setMonth(date.getMonth() + 1);
  return date;
}

@Injectable()
export class MonitorsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MonitorsService.name);
  private timer?: NodeJS.Timeout;
  private polling = false;

  constructor(
    @InjectModel(Monitor.name) private readonly monitorModel: Model<MonitorDocument>,
    private readonly trackerService: TrackerService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.runDueMonitors(), 60_000);
    this.timer.unref?.();
    void this.runDueMonitors();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async create(dto: CreateMonitorDto): Promise<MonitorDocument> {
    return new this.monitorModel({
      name: dto.name.trim(),
      prompt: dto.prompt.trim(),
      plan: {
        prompt: dto.prompt.trim(),
        keywords: dto.keywords,
        tags: dto.tags,
        queries: dto.queries,
        timeRange: dto.timeRange,
        maxPosts: dto.maxPosts,
        researchDepth: dto.researchDepth ?? 'standard',
      },
      cadence: dto.cadence,
      intervalHours: dto.cadence === 'custom-hours' ? dto.intervalHours ?? 1 : undefined,
      enabled: true,
      nextRunAt: nextRun(dto.cadence, new Date(), dto.intervalHours),
    }).save();
  }

  async findAll(): Promise<MonitorDocument[]> {
    return this.monitorModel.find().sort({ createdAt: -1 }).exec();
  }

  async findOne(id: string): Promise<MonitorDocument> {
    const monitor = await this.monitorModel.findById(id).exec();
    if (!monitor) throw new NotFoundException(`Monitor ${id} not found`);
    return monitor;
  }

  async update(id: string, dto: UpdateMonitorDto): Promise<MonitorDocument> {
    const monitor = await this.findOne(id);
    if (dto.cadence) {
      monitor.cadence = dto.cadence;
      monitor.intervalHours = dto.cadence === 'custom-hours' ? dto.intervalHours ?? monitor.intervalHours ?? 1 : undefined;
      monitor.nextRunAt = nextRun(dto.cadence, new Date(), monitor.intervalHours);
    } else if (dto.intervalHours !== undefined && monitor.cadence === 'custom-hours') {
      monitor.intervalHours = dto.intervalHours;
      monitor.nextRunAt = nextRun(monitor.cadence, new Date(), monitor.intervalHours);
    }
    if (typeof dto.enabled === 'boolean') {
      monitor.enabled = dto.enabled;
      if (dto.enabled && monitor.nextRunAt < new Date()) monitor.nextRunAt = nextRun(monitor.cadence, new Date(), monitor.intervalHours);
    }
    return monitor.save();
  }

  async remove(id: string): Promise<void> {
    const result = await this.monitorModel.findByIdAndDelete(id).exec();
    if (!result) throw new NotFoundException(`Monitor ${id} not found`);
  }

  async runNow(id: string) {
    const monitor = await this.findOne(id);
    return this.executeMonitor(monitor, false);
  }

  private async runDueMonitors(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const due = await this.monitorModel
        .find({ enabled: true, nextRunAt: { $lte: new Date() } })
        .sort({ nextRunAt: 1 })
        .limit(5)
        .exec();
      for (const monitor of due) {
        await this.executeMonitor(monitor, true).catch((error) => {
          this.logger.error(`Scheduled monitor ${monitor.id} failed: ${String(error)}`);
        });
      }
    } finally {
      this.polling = false;
    }
  }

  private async executeMonitor(monitor: MonitorDocument, advanceSchedule: boolean) {
    try {
      const result = await this.trackerService.analyzePlan(monitor.plan, undefined, undefined, {
        monitorId: String(monitor._id),
        runType: advanceSchedule ? 'scheduled' : 'manual-monitor',
      });
      monitor.lastRunAt = new Date();
      monitor.lastQueryId = result.id;
      monitor.lastError = undefined;
      if (advanceSchedule) monitor.nextRunAt = nextRun(monitor.cadence, monitor.nextRunAt, monitor.intervalHours);
      await monitor.save();
      return result;
    } catch (error) {
      monitor.lastRunAt = new Date();
      monitor.lastError = error instanceof Error ? error.message : String(error);
      if (advanceSchedule) monitor.nextRunAt = nextRun(monitor.cadence, monitor.nextRunAt, monitor.intervalHours);
      await monitor.save();
      throw error;
    }
  }
}
