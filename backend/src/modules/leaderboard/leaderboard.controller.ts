import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from 'src/common/decorators';
import { LeaderboardPeriod, LeaderboardService } from './leaderboard.service';

@ApiTags('leaderboard')
@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboard: LeaderboardService) {}

  @Public()
  @Get()
  @ApiQuery({ name: 'period', enum: ['week', 'month', 'all'], required: false })
  @ApiOperation({ summary: 'Every leaderboard board in one call' })
  async all(@Query('period') period: LeaderboardPeriod = 'month') {
    const [topMana, mostActive, mostUpvoted, contributors, posts, ranks] = await Promise.all([
      this.leaderboard.topByMana(25),
      this.leaderboard.mostActive(period, 25),
      this.leaderboard.mostUpvoted(25),
      this.leaderboard.topContributors(25),
      this.leaderboard.popularPosts(period, 10),
      this.leaderboard.ranks(),
    ]);
    return { period, topMana, mostActive, mostUpvoted, contributors, popularPosts: posts, ranks };
  }

  @Public()
  @Get('mana')
  @ApiOperation({ summary: 'Top Mana holders' })
  mana() {
    return this.leaderboard.topByMana(50);
  }

  @Public()
  @Get('ranks')
  @ApiOperation({ summary: 'Rank ladder with member counts' })
  ranks() {
    return this.leaderboard.ranks();
  }
}
