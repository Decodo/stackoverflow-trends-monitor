import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Monitor, MonitorSchema } from './monitors.schema';
import { MonitorsController } from './monitors.controller';
import { MonitorsService } from './monitors.service';
import { TrackerModule } from '../tracker/tracker.module';

@Module({
  imports: [MongooseModule.forFeature([{ name: Monitor.name, schema: MonitorSchema }]), TrackerModule],
  controllers: [MonitorsController],
  providers: [MonitorsService],
  exports: [MonitorsService],
})
export class MonitorsModule {}
