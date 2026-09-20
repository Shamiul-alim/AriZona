import { Global, Module } from '@nestjs/common';
import { ManaController } from './mana.controller';
import { ManaService } from './mana.service';

@Global()
@Module({
  controllers: [ManaController],
  providers: [ManaService],
  exports: [ManaService],
})
export class ManaModule {}
