import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Public, Roles } from 'src/common/decorators';
import { UpsertAdPlacementDto } from './dto/ads.dto';
import { AdsService } from './ads.service';

@ApiTags('ads')
@Controller('ads')
export class AdsController {
  constructor(private readonly ads: AdsService) {}

  @Public()
  @Get('config')
  @ApiOperation({ summary: 'Enabled ad placements for the frontend' })
  config() {
    return this.ads.publicConfig();
  }

  @Get('placements')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Every placement, enabled or not' })
  listAll() {
    return this.ads.listAll();
  }

  @Put('placements/:key')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create or update a placement' })
  upsert(@Param('key') key: string, @Body() dto: UpsertAdPlacementDto) {
    return this.ads.upsert(key, dto);
  }

  @Delete('placements/:key')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a placement' })
  remove(@Param('key') key: string) {
    return this.ads.remove(key);
  }
}
