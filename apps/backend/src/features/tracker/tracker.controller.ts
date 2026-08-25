import { Controller, Post, Body, Res, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';
import { TrackerService } from './tracker.service';
import type { OnProgress } from './tracker.service';
import { GeneratePlanDto } from './dto/generate-plan.dto';
import { AnalyzePlanDto } from './dto/analyze-plan.dto';
import { AnalyzeTrendingDto } from './dto/analyze-trending.dto';

@Controller('tracker')
export class TrackerController {
  private readonly logger = new Logger(TrackerController.name);

  constructor(private readonly trackerService: TrackerService) {}

  @Post('plan')
  @HttpCode(HttpStatus.OK)
  async generatePlan(@Body() dto: GeneratePlanDto) {
    return this.trackerService.generatePlan(dto);
  }

  @Post('analyze')
  @HttpCode(HttpStatus.OK)
  async analyzePlan(@Body() dto: AnalyzePlanDto) {
    return this.trackerService.analyzePlan(dto, undefined, undefined, {
      monitorId: dto.monitorId,
      runType: dto.monitorId ? 'manual-monitor' : 'manual',
    });
  }

  @Post('analyze/stream')
  async analyzePlanStream(@Body() dto: AnalyzePlanDto, @Res() res: Response): Promise<void> {
    return this.stream(res, (onProgress, signal) =>
      this.trackerService.analyzePlan(dto, onProgress, signal, {
        monitorId: dto.monitorId,
        runType: dto.monitorId ? 'manual-monitor' : 'manual',
      }),
      dto.prompt,
    );
  }

  @Post('trending/stream')
  async trendingStream(@Body() dto: AnalyzeTrendingDto, @Res() res: Response): Promise<void> {
    return this.stream(res, (onProgress, signal) => this.trackerService.analyzeTrending(dto.researchDepth ?? 'standard', onProgress, signal), 'Stack Overflow trends');
  }

  private async stream(
    res: Response,
    run: (onProgress: OnProgress, signal: AbortSignal) => Promise<object>,
    label: string,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (data: object) => {
      if (!res.destroyed) res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const ac = new AbortController();
    let finished = false;
    res.on('close', () => {
      if (finished || ac.signal.aborted) return;
      this.logger.log(`[Analyze] Client disconnected — cancelling request: "${label}"`);
      ac.abort();
    });

    try {
      const result = await run((event) => send(event), ac.signal);
      send({ type: 'complete', ...result });
    } catch (err) {
      send({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      finished = true;
      res.end();
    }
  }
}
