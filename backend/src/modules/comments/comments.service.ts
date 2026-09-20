import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ManaEvent, Prisma, UserRole } from '@prisma/client';
import { paginate } from 'src/common/dto/pagination.dto';
import { AuthenticatedUser } from 'src/common/types/authenticated-user';
import { sanitizePlainText } from 'src/common/utils/sanitize.util';
import { PrismaService } from 'src/prisma/prisma.service';
import { ManaService } from '../mana/mana.service';
import { CommentSort, CreateCommentDto, UpdateCommentDto } from './dto/comment.dto';

const AUTHOR_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  role: true,
  mana: true,
  rank: { select: { name: true, color: true, icon: true } },
} satisfies Prisma.UserSelect;

/** How long after posting a comment may still be edited by its author. */
const EDIT_WINDOW_MS = 15 * 60 * 1000;

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mana: ManaService,
  ) {}

  async list(
    target: { animeSlug?: string; episodeId?: string },
    sort: CommentSort,
    page: number,
    limit: number,
    viewerId?: string,
  ) {
    const scope = await this.resolveScope(target);

    const where: Prisma.CommentWhereInput = { ...scope, parentId: null };
    const orderBy: Prisma.CommentOrderByWithRelationInput[] =
      sort === CommentSort.TOP
        ? [{ upvoteCount: 'desc' }, { createdAt: 'desc' }]
        : sort === CommentSort.OLDEST
          ? [{ createdAt: 'asc' }]
          : [{ createdAt: 'desc' }];

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.comment.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: AUTHOR_SELECT },
          replies: {
            where: { isDeleted: false },
            orderBy: { createdAt: 'asc' },
            take: 3,
            include: { user: { select: AUTHOR_SELECT } },
          },
        },
      }),
      this.prisma.comment.count({ where }),
    ]);

    const myVotes = await this.votesOf(
      viewerId,
      rows.flatMap((r) => [r.id, ...r.replies.map((x) => x.id)]),
    );

    return paginate(
      rows.map((row) => this.present(row, myVotes)),
      total,
      page,
      limit,
    );
  }

  async replies(commentId: string, page: number, limit: number, viewerId?: string) {
    const where: Prisma.CommentWhereInput = { parentId: commentId, isDeleted: false };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.comment.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: AUTHOR_SELECT } },
      }),
      this.prisma.comment.count({ where }),
    ]);

    const myVotes = await this.votesOf(viewerId, rows.map((r) => r.id));
    return paginate(rows.map((r) => this.present(r, myVotes)), total, page, limit);
  }

  async create(userId: string, dto: CreateCommentDto) {
    const body = sanitizePlainText(dto.body);
    if (body.length < 2) throw new BadRequestException('Your comment is too short');

    const scope = await this.resolveScope({ animeSlug: dto.animeSlug, episodeId: dto.episodeId });

    if (dto.parentId) {
      const parent = await this.prisma.comment.findUnique({
        where: { id: dto.parentId },
        select: { id: true, animeId: true, episodeId: true, parentId: true, isDeleted: true },
      });
      if (!parent || parent.isDeleted) throw new NotFoundException('The comment you replied to no longer exists');
      // Replies are one level deep; replying to a reply attaches to its root.
      dto.parentId = parent.parentId ?? parent.id;
    }

    await this.assertNotFlooding(userId);

    const comment = await this.prisma.comment.create({
      data: {
        userId,
        animeId: scope.animeId ?? null,
        episodeId: scope.episodeId ?? null,
        parentId: dto.parentId ?? null,
        body,
        isSpoiler: dto.isSpoiler ?? false,
      },
      include: { user: { select: AUTHOR_SELECT } },
    });

    if (dto.parentId) {
      await this.prisma.comment.update({
        where: { id: dto.parentId },
        data: { replyCount: { increment: 1 } },
      });
    }

    await this.mana.award(userId, ManaEvent.EPISODE_COMMENT, { reason: 'Posted a comment' });

    return this.present({ ...comment, replies: [] }, new Map());
  }

  async update(viewer: AuthenticatedUser, commentId: string, dto: UpdateCommentDto) {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment || comment.isDeleted) throw new NotFoundException('Comment not found');
    if (comment.userId !== viewer.id) throw new ForbiddenException('You can only edit your own comments');
    if (Date.now() - comment.createdAt.getTime() > EDIT_WINDOW_MS) {
      throw new ForbiddenException('Comments can only be edited within 15 minutes of posting');
    }

    const body = sanitizePlainText(dto.body);
    if (body.length < 2) throw new BadRequestException('Your comment is too short');

    const updated = await this.prisma.comment.update({
      where: { id: commentId },
      data: { body, isEdited: true, isSpoiler: dto.isSpoiler ?? comment.isSpoiler },
      include: { user: { select: AUTHOR_SELECT } },
    });
    return this.present({ ...updated, replies: [] }, new Map());
  }

  /**
   * Soft delete: the row is kept so an open report against it stays meaningful,
   * and so reply threads do not lose their structure.
   */
  async remove(viewer: AuthenticatedUser, commentId: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment || comment.isDeleted) throw new NotFoundException('Comment not found');

    const isOwner = comment.userId === viewer.id;
    const isModerator = viewer.role !== UserRole.USER;
    if (!isOwner && !isModerator) {
      throw new ForbiddenException('You can only delete your own comments');
    }

    await this.prisma.comment.update({
      where: { id: commentId },
      data: {
        isDeleted: true,
        deletedReason: isOwner ? 'Removed by author' : `Removed by ${viewer.role.toLowerCase()}`,
      },
    });
    return { deleted: true };
  }

  /** Toggling the same value again withdraws the vote. */
  async vote(userId: string, commentId: string, value: 1 | -1) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, userId: true, isDeleted: true },
    });
    if (!comment || comment.isDeleted) throw new NotFoundException('Comment not found');
    if (comment.userId === userId) throw new BadRequestException('You cannot vote on your own comment');

    const existing = await this.prisma.commentVote.findUnique({
      where: { commentId_userId: { commentId, userId } },
    });

    if (existing?.value === value) {
      await this.prisma.$transaction([
        this.prisma.commentVote.delete({ where: { id: existing.id } }),
        this.prisma.comment.update({
          where: { id: commentId },
          data: value === 1 ? { upvoteCount: { decrement: 1 } } : { downvoteCount: { decrement: 1 } },
        }),
      ]);
      if (value === 1) {
        await this.mana.revoke(comment.userId, ManaEvent.RECEIVED_UPVOTE, `UPVOTE:${commentId}:${userId}`);
      }
      return this.voteState(commentId, null);
    }

    if (existing) {
      await this.prisma.$transaction([
        this.prisma.commentVote.update({ where: { id: existing.id }, data: { value } }),
        this.prisma.comment.update({
          where: { id: commentId },
          data:
            value === 1
              ? { upvoteCount: { increment: 1 }, downvoteCount: { decrement: 1 } }
              : { upvoteCount: { decrement: 1 }, downvoteCount: { increment: 1 } },
        }),
      ]);
    } else {
      await this.prisma.$transaction([
        this.prisma.commentVote.create({ data: { commentId, userId, value } }),
        this.prisma.comment.update({
          where: { id: commentId },
          data: value === 1 ? { upvoteCount: { increment: 1 } } : { downvoteCount: { increment: 1 } },
        }),
      ]);
    }

    if (value === 1) {
      await this.mana.award(comment.userId, ManaEvent.RECEIVED_UPVOTE, {
        dedupeKey: `UPVOTE:${commentId}:${userId}`,
        reason: 'Comment received an upvote',
      });
    }

    return this.voteState(commentId, value);
  }

  private async voteState(commentId: string, myVote: 1 | -1 | null) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { upvoteCount: true, downvoteCount: true },
    });
    return { ...comment, myVote };
  }

  private async votesOf(userId: string | undefined, commentIds: string[]) {
    if (!userId || commentIds.length === 0) return new Map<string, number>();
    const votes = await this.prisma.commentVote.findMany({
      where: { userId, commentId: { in: commentIds } },
      select: { commentId: true, value: true },
    });
    return new Map(votes.map((v) => [v.commentId, v.value]));
  }

  /** Simple flood control on top of the global rate limiter. */
  private async assertNotFlooding(userId: string) {
    const since = new Date(Date.now() - 60_000);
    const recent = await this.prisma.comment.count({ where: { userId, createdAt: { gte: since } } });
    if (recent >= 5) {
      throw new BadRequestException('You are commenting too quickly. Please wait a moment.');
    }
  }

  private async resolveScope(target: { animeSlug?: string; episodeId?: string }) {
    if (target.episodeId) {
      const episode = await this.prisma.episode.findUnique({
        where: { id: target.episodeId },
        select: { id: true, animeId: true },
      });
      if (!episode) throw new NotFoundException('Episode not found');
      return { episodeId: episode.id, isDeleted: false } as const;
    }
    if (target.animeSlug) {
      const anime = await this.prisma.anime.findFirst({
        where: { slug: target.animeSlug, deletedAt: null },
        select: { id: true },
      });
      if (!anime) throw new NotFoundException('Anime not found');
      return { animeId: anime.id, isDeleted: false } as const;
    }
    throw new BadRequestException('Either animeSlug or episodeId is required');
  }

  private present(
    row: {
      id: string;
      body: string;
      isSpoiler: boolean;
      isEdited: boolean;
      isDeleted: boolean;
      upvoteCount: number;
      downvoteCount: number;
      replyCount: number;
      createdAt: Date;
      userId: string;
      user: Prisma.UserGetPayload<{ select: typeof AUTHOR_SELECT }>;
      replies?: Array<Parameters<CommentsService['present']>[0]>;
    },
    myVotes: Map<string, number>,
  ): unknown {
    return {
      id: row.id,
      body: row.isDeleted ? null : row.body,
      isDeleted: row.isDeleted,
      isSpoiler: row.isSpoiler,
      isEdited: row.isEdited,
      upvoteCount: row.upvoteCount,
      downvoteCount: row.downvoteCount,
      replyCount: row.replyCount,
      createdAt: row.createdAt,
      myVote: myVotes.get(row.id) ?? null,
      author: row.isDeleted ? null : row.user,
      replies: row.replies?.map((reply) => this.present(reply, myVotes)) ?? [],
    };
  }
}
