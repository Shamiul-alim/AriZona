import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequestStatus, UserRole } from '@prisma/client';
import { CurrentUser, OptionalAuth, Public, Roles } from 'src/common/decorators';
import { PaginationQueryDto } from 'src/common/dto/pagination.dto';
import { AuthenticatedUser } from 'src/common/types/authenticated-user';
import { CreateAnimeRequestDto, UpdateAnimeRequestDto } from './dto/request.dto';
import { RequestsService } from './requests.service';

@ApiTags('anime-requests')
@Controller('anime-requests')
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @OptionalAuth()
  @Post()
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Request a title that is not on the site yet' })
  create(@Body() dto: CreateAnimeRequestDto, @CurrentUser() user?: AuthenticatedUser) {
    return this.requests.create(dto, user?.id);
  }

  @Public()
  @Get('public')
  @ApiOperation({ summary: 'Publicly visible request queue' })
  listPublic(@Query() pagination: PaginationQueryDto) {
    return this.requests.listPublic(pagination.page, pagination.limit);
  }

  @Get('mine')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Requests submitted by the signed-in user' })
  listMine(@CurrentUser() user: AuthenticatedUser, @Query() pagination: PaginationQueryDto) {
    return this.requests.listMine(user.id, pagination.page, pagination.limit);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Full request queue (admin)' })
  listAll(@Query() pagination: PaginationQueryDto, @Query('status') status?: RequestStatus) {
    return this.requests.listAll(status, pagination.page, pagination.limit);
  }

  @Get('counts')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Request totals per status' })
  counts() {
    return this.requests.counts();
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Move a request through the workflow' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAnimeRequestDto) {
    return this.requests.update(id, dto);
  }
}
