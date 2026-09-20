import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser, OptionalAuth, Roles } from 'src/common/decorators';
import { PaginationQueryDto } from 'src/common/dto/pagination.dto';
import { AuthenticatedUser } from 'src/common/types/authenticated-user';
import { CreateReportDto, ReportQueryDto, ResolveReportDto } from './dto/report.dto';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @OptionalAuth()
  @Post()
  @Throttle({ default: { limit: 6, ttl: 300_000 } })
  @ApiOperation({ summary: 'Report a broken episode, a comment, or a post' })
  create(@Body() dto: CreateReportDto, @CurrentUser() user?: AuthenticatedUser) {
    return this.reports.create(dto, user?.id);
  }

  @Get()
  @Roles(UserRole.MODERATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Moderation queue' })
  list(@Query() query: ReportQueryDto, @Query() pagination: PaginationQueryDto) {
    return this.reports.list(query, pagination.page, pagination.limit);
  }

  @Get('counts')
  @Roles(UserRole.MODERATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Report totals per status' })
  counts() {
    return this.reports.counts();
  }

  @Get(':id')
  @Roles(UserRole.MODERATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'One report with its resolved target' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.reports.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.MODERATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Move a report through the workflow' })
  resolve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveReportDto,
  ) {
    return this.reports.resolve(id, user.id, dto);
  }
}
