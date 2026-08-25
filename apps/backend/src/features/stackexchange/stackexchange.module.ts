import { Module } from '@nestjs/common';
import { StackExchangeService } from './stackexchange.service';

@Module({
  providers: [StackExchangeService],
  exports: [StackExchangeService],
})
export class StackExchangeModule {}
