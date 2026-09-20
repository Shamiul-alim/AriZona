import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from 'src/common/decorators';
import { TaxonomyService } from './taxonomy.service';

@ApiTags('taxonomy')
@Controller()
export class TaxonomyController {
  constructor(private readonly taxonomy: TaxonomyService) {}

  @Public()
  @Get('genres')
  @ApiOperation({ summary: 'All genres with published-title counts' })
  genres() {
    return this.taxonomy.genres();
  }

  @Public()
  @Get('studios')
  @ApiOperation({ summary: 'All studios' })
  studios(@Query('search') search?: string) {
    return this.taxonomy.studios(search);
  }

  @Public()
  @Get('producers')
  @ApiOperation({ summary: 'All producers' })
  producers(@Query('search') search?: string) {
    return this.taxonomy.producers(search);
  }

  @Public()
  @Get('years')
  @ApiOperation({ summary: 'Release years present in the catalogue' })
  years() {
    return this.taxonomy.years();
  }
}
