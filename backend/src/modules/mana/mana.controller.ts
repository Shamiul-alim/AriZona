import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from 'src/common/decorators';
import { PaginationQueryDto, paginate } from 'src/common/dto/pagination.dto';
import { AuthenticatedUser } from 'src/common/types/authenticated-user';
import { ManaService } from './mana.service';

@ApiTags('mana')
@ApiBearerAuth()
@Controller('mana')
export class ManaController {
  constructor(private readonly mana: ManaService) {}

  @Get('me')
  @ApiOperation({ summary: 'Current Mana balance, rank, and progress to the next rank' })
  progress(@CurrentUser() user: AuthenticatedUser) {
    return this.mana.progressFor(user.id);
  }

  @Get('me/history')
  @ApiOperation({ summary: 'Paginated Mana transaction history' })
  async history(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    const { data, total } = await this.mana.historyFor(user.id, query.skip, query.limit);
    return paginate(data, total, query.page, query.limit);
  }
}
