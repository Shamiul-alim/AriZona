import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public } from 'src/common/decorators';
import { PaginationQueryDto } from 'src/common/dto/pagination.dto';
import { AuthenticatedUser } from 'src/common/types/authenticated-user';
import { UpdatePreferencesDto, UpdateProfileDto } from './dto/user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Full account record for the signed-in user' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.users.me(user.id);
  }

  @Patch('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update profile details' })
  updateProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.id, dto);
  }

  @Patch('me/preferences')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update playback and display preferences' })
  updatePreferences(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdatePreferencesDto) {
    return this.users.updatePreferences(user.id, dto);
  }

  @Public()
  @Get(':username')
  @ApiOperation({ summary: 'Public profile' })
  profile(@Param('username') username: string) {
    return this.users.publicProfile(username);
  }

  @Public()
  @Get(':username/activity')
  @ApiOperation({ summary: 'Recent comments and community posts' })
  activity(@Param('username') username: string, @Query() pagination: PaginationQueryDto) {
    return this.users.activity(username, pagination.page, pagination.limit);
  }
}
