import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsObject } from 'class-validator';
import { Public, Roles } from 'src/common/decorators';
import { SettingsService } from './settings.service';

class SetManyDto {
  @IsObject()
  values!: Record<string, unknown>;
}

class SetOneDto {
  value!: unknown;
}

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Public()
  @Get('public')
  @ApiOperation({ summary: 'Settings the frontend is allowed to read' })
  publicSettings() {
    return this.settings.publicSettings();
  }

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'All settings, grouped' })
  all() {
    return this.settings.all();
  }

  @Put()
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update several settings at once' })
  setMany(@Body() dto: SetManyDto) {
    return this.settings.setMany(dto.values);
  }

  @Put(':key')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update one setting' })
  set(@Param('key') key: string, @Body() dto: SetOneDto) {
    return this.settings.set(key, dto.value);
  }
}
