import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, OptionalAuth } from 'src/common/decorators';
import { PaginationQueryDto } from 'src/common/dto/pagination.dto';
import { AuthenticatedUser } from 'src/common/types/authenticated-user';
import { CommentQueryDto, CommentSort, CreateCommentDto, UpdateCommentDto } from './dto/comment.dto';
import { CommentsService } from './comments.service';

@ApiTags('comments')
@Controller('comments')
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @OptionalAuth()
  @Get()
  @ApiOperation({ summary: 'Comments for an anime or an episode' })
  list(
    @Query() query: CommentQueryDto,
    @Query() pagination: PaginationQueryDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.comments.list(
      { animeSlug: query.animeSlug, episodeId: query.episodeId },
      query.sort ?? CommentSort.NEWEST,
      pagination.page,
      pagination.limit,
      user?.id,
    );
  }

  @OptionalAuth()
  @Get(':id/replies')
  @ApiOperation({ summary: 'Replies to one comment' })
  replies(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() pagination: PaginationQueryDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.comments.replies(id, pagination.page, pagination.limit, user?.id);
  }

  @Post()
  @ApiBearerAuth()
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @ApiOperation({ summary: 'Post a comment or a reply' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCommentDto) {
    return this.comments.create(user.id, dto);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Edit your own comment (within 15 minutes)' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCommentDto,
  ) {
    return this.comments.update(user, id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete your own comment, or any comment as a moderator' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.comments.remove(user, id);
  }

  @Post(':id/upvote')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upvote, or withdraw an existing upvote' })
  upvote(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.comments.vote(user.id, id, 1);
  }

  @Post(':id/downvote')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Downvote, or withdraw an existing downvote' })
  downvote(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.comments.vote(user.id, id, -1);
  }
}
