import { Module } from '@nestjs/common';
import { CommunityController } from './community.controller';
import { CommunityService } from './community.service';
import { PollsService } from './polls.service';

@Module({
  controllers: [CommunityController],
  providers: [CommunityService, PollsService],
  exports: [CommunityService, PollsService],
})
export class CommunityModule {}
