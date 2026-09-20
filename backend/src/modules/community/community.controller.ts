import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, OptionalAuth, Public } from 'src/common/decorators';
import { PaginationQueryDto } from 'src/common/dto/pagination.dto';
import { AuthenticatedUser } from 'src/common/types/authenticated-user';
import {
  CreateCommunityCommentDto,
  CreatePostDto,
  PollVoteDto,
  PostQueryDto,
  UpdatePostDto,
  VoteDto,
} from './dto/community.dto';
import { CommunityService } from './community.service';
import { PollsService } from './polls.service';

@ApiTags('community')
@Controller('community')
export class CommunityController {
  constructor(
    private readonly community: CommunityService,
    private readonly polls: PollsService,
  ) {}

  @Public()
  @Get('categories')
  @ApiOperation({ summary: 'Board categories with post counts' })
  categories() {
    return this.community.categories();
  }

  @OptionalAuth()
  @Get('posts')
  @ApiOperation({ summary: 'Browse the board' })
  listPosts(
    @Query() query: PostQueryDto,
    @Query() pagination: PaginationQueryDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.community.listPosts(query, pagination.page, pagination.limit, user?.id);
  }

  @Post('posts')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 6, ttl: 600_000 } })
  @ApiOperation({ summary: 'Create a post (text, poll, tier list, matchup or recommendation)' })
  createPost(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePostDto) {
    return this.community.createPost(user, dto);
  }

  @OptionalAuth()
  @Get('posts/:slug')
  @ApiOperation({ summary: 'One post with its poll, tier list and referenced titles' })
  findPost(@Param('slug') slug: string, @CurrentUser() user?: AuthenticatedUser) {
    return this.community.findPost(slug, user?.id);
  }

  @Patch('posts/:slug')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Edit your own post' })
  updatePost(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
    @Body() dto: UpdatePostDto,
  ) {
    return this.community.updatePost(user, slug, dto);
  }

  @Delete('posts/:slug')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete your own post, or any post as a moderator' })
  deletePost(@CurrentUser() user: AuthenticatedUser, @Param('slug') slug: string) {
    return this.community.deletePost(user, slug);
  }

  @Post('posts/:slug/vote')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upvote or downvote a post (repeat to withdraw)' })
  votePost(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
    @Body() dto: VoteDto,
  ) {
    return this.community.votePost(user.id, slug, dto.value === -1 ? -1 : 1);
  }

  @OptionalAuth()
  @Get('posts/:slug/comments')
  @ApiOperation({ summary: 'Comments on a post' })
  listComments(
    @Param('slug') slug: string,
    @Query() pagination: PaginationQueryDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.community.listComments(slug, pagination.page, pagination.limit, user?.id);
  }

  @Post('posts/:slug/comments')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @ApiOperation({ summary: 'Comment on a post or reply to a comment' })
  addComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
    @Body() dto: CreateCommunityCommentDto,
  ) {
    return this.community.addComment(user.id, slug, dto);
  }

  @Delete('comments/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a community comment' })
  deleteComment(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.community.deleteComment(user, id);
  }

  @Post('comments/:id/upvote')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upvote a community comment (repeat to withdraw)' })
  voteComment(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.community.voteComment(user.id, id, 1);
  }

  @OptionalAuth()
  @Get('polls/:id')
  @ApiOperation({ summary: 'Poll results' })
  pollResults(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user?: AuthenticatedUser) {
    return this.polls.results(id, user?.id);
  }

  @Post('polls/:id/vote')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cast or change a poll vote' })
  votePoll(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PollVoteDto,
  ) {
    return this.polls.vote(user.id, id, dto.optionIds);
  }
}
