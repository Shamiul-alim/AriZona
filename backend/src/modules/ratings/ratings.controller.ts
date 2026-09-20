import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { CurrentUser, OptionalAuth } from 'src/common/decorators';
import { AuthenticatedUser } from 'src/common/types/authenticated-user';
import { RatingsService } from './ratings.service';

class RateDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  score!: number;
}

@ApiTags('ratings')
@Controller('anime/:slug/rating')
export class RatingsController {
  constructor(private readonly ratings: RatingsService) {}

  @OptionalAuth()
  @Get()
  @ApiOperation({ summary: 'Average, distribution and the signed-in user’s own rating' })
  summary(@Param('slug') slug: string, @CurrentUser() user?: AuthenticatedUser) {
    return this.ratings.summary(slug, user?.id);
  }

  @Put()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit or update a rating (1-10)' })
  rate(@CurrentUser() user: AuthenticatedUser, @Param('slug') slug: string, @Body() dto: RateDto) {
    return this.ratings.rate(user.id, slug, dto.score);
  }

  @Delete()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Withdraw a rating' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('slug') slug: string) {
    return this.ratings.remove(user.id, slug);
  }
}
