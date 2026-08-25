import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { DecodoModule } from '../decodo/decodo.module';
import { QueriesModule } from '../queries/queries.module';
import { StackExchangeModule } from '../stackexchange/stackexchange.module';
import { TrackerController } from './tracker.controller';
import { TrackerService } from './tracker.service';

@Module({
  imports: [LlmModule, DecodoModule, StackExchangeModule, QueriesModule],
  controllers: [TrackerController],
  providers: [TrackerService],
  exports: [TrackerService],
})
export class TrackerModule {}
