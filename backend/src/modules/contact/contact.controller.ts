import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ContactStatus, UserRole } from '@prisma/client';
import type { Request } from 'express';
import { Public, Roles } from 'src/common/decorators';
import { PaginationQueryDto } from 'src/common/dto/pagination.dto';
import { CreateContactDto, UpdateContactDto } from './dto/contact.dto';
import { ContactService } from './contact.service';

@ApiTags('contact')
@Controller('contact')
export class ContactController {
  constructor(private readonly contact: ContactService) {}

  @Public()
  @Post()
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Send a support message' })
  async create(@Body() dto: CreateContactDto, @Req() req: Request) {
    await this.contact.create(dto, req.ip);
    return { message: 'Thanks — your message has been received. We usually reply within a few days.' };
  }

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Support inbox' })
  list(@Query() pagination: PaginationQueryDto, @Query('status') status?: ContactStatus) {
    return this.contact.list(status, pagination.page, pagination.limit);
  }

  @Get('counts')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Inbox totals per status' })
  counts() {
    return this.contact.counts();
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update the status of a support message' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateContactDto) {
    return this.contact.update(id, dto);
  }
}
