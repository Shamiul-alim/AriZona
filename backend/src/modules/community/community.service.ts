import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CommunityPostKind, ManaEvent, Prisma, UserRole } from '@prisma/client';
import { paginate } from 'src/common/dto/pagination.dto';
import { AuthenticatedUser } from 'src/common/types/authenticated-user';
import { sanitizePlainText, sanitizeRichText } from 'src/common/utils/sanitize.util';
import { uniqueSlug } from 'src/common/utils/slug.util';
import { PrismaService } from 'src/prisma/prisma.service';
import { ManaService } from '../mana/mana.service';
import {
  CommunitySort,
  CreateCommunityCommentDto,
  CreatePostDto,
  PostQueryDto,
  UpdatePostDto,
} from './dto/community.dto';

const AUTHOR_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  role: true,
  mana: true,
  rank: { select: { name: true, color: true, icon: true } },
} satisfies Prisma.UserSelect;

const POST_ANIME_SELECT = {
  id: true,
  slug: true,
  titleEnglish: true,
  posterUrl: true,
  type: true,
  score: true,
} satisfies Prisma.AnimeSelect;

@Injectable()
export class CommunityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mana: ManaService,
  ) {}

  categories() {
    return this.prisma.communityCategory.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
      include: {
        _count: { select: { posts: { where: { isDeleted: false } } } },
      },
    });
  }

  async listPosts(query: PostQueryDto, page: number, limit: number, viewerId?: string) {
    const where: Prisma.CommunityPostWhereInput = {
      isDeleted: false,
      ...(query.category ? { category: { slug: query.category } } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { body: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const orderBy = this.postOrder(query.sort ?? CommunitySort.NEWEST);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.communityPost.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: AUTHOR_SELECT },
          category: { select: { name: true, slug: true, color: true, icon: true } },
          poll: { select: { id: true, question: true, totalVotes: true, closesAt: true } },
          animeRefs: { include: { anime: { select: POST_ANIME_SELECT } }, take: 4, orderBy: { order: 'asc' } },
        },
      }),
      this.prisma.communityPost.count({ where }),
    ]);

    const myVotes = await this.postVotesOf(viewerId, rows.map((r) => r.id));

    return paginate(
      rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        title: row.title,
        excerpt: row.body.replace(/<[^>]+>/g, '').slice(0, 220),
        kind: row.kind,
        category: row.category,
        author: row.user,
        upvoteCount: row.upvoteCount,
        downvoteCount: row.downvoteCount,
        commentCount: row.commentCount,
        viewCount: row.viewCount,
        isPinned: row.isPinned,
        isLocked: row.isLocked,
        createdAt: row.createdAt,
        myVote: myVotes.get(row.id) ?? null,
        poll: row.poll,
        anime: row.animeRefs.map((r) => ({ ...r.anime, score: Number(r.anime.score) })),
      })),
      total,
      page,
      limit,
    );
  }

  async findPost(slug: string, viewerId?: string) {
    const post = await this.prisma.communityPost.findUnique({
      where: { slug },
      include: {
        user: { select: AUTHOR_SELECT },
        category: { select: { name: true, slug: true, color: true, icon: true } },
        poll: { include: { options: { orderBy: { order: 'asc' }, include: { anime: { select: POST_ANIME_SELECT } } } } },
        tierListItems: { orderBy: [{ tier: 'asc' }, { order: 'asc' }], include: { anime: { select: POST_ANIME_SELECT } } },
        animeRefs: { orderBy: { order: 'asc' }, include: { anime: { select: POST_ANIME_SELECT } } },
      },
    });
    if (!post || post.isDeleted) throw new NotFoundException('Post not found');

    await this.prisma.communityPost.update({
      where: { id: post.id },
      data: { viewCount: { increment: 1 } },
    });

    const [myVote, myPollVotes] = await Promise.all([
      viewerId
        ? this.prisma.communityVote.findUnique({
            where: { userId_postId: { userId: viewerId, postId: post.id } },
          })
        : Promise.resolve(null),
      viewerId && post.poll
        ? this.prisma.pollVote.findMany({
            where: { userId: viewerId, pollId: post.poll.id },
            select: { pollOptionId: true },
          })
        : Promise.resolve([]),
    ]);

    return {
      ...post,
      author: post.user,
      user: undefined,
      myVote: myVote?.value ?? null,
      poll: post.poll
        ? {
            ...post.poll,
            myVotes: myPollVotes.map((v) => v.pollOptionId),
            hasVoted: myPollVotes.length > 0,
            isClosed: Boolean(post.poll.closesAt && post.poll.closesAt < new Date()),
            options: post.poll.options.map((o) => ({
              ...o,
              anime: o.anime ? { ...o.anime, score: Number(o.anime.score) } : null,
              percent: post.poll!.totalVotes > 0 ? Math.round((o.voteCount / post.poll!.totalVotes) * 100) : 0,
            })),
          }
        : null,
      tierList: post.tierListItems.map((i) => ({
        ...i,
        anime: i.anime ? { ...i.anime, score: Number(i.anime.score) } : null,
      })),
      tierListItems: undefined,
      anime: post.animeRefs.map((r) => ({ ...r.anime, score: Number(r.anime.score), note: r.note })),
      animeRefs: undefined,
    };
  }

  async createPost(user: AuthenticatedUser, dto: CreatePostDto) {
    const category = await this.prisma.communityCategory.findUnique({
      where: { slug: dto.categorySlug },
    });
    if (!category || !category.isActive) throw new NotFoundException('Category not found');
    if (category.staffOnly && user.role === UserRole.USER) {
      throw new ForbiddenException('Only staff can post in this category');
    }

    const kind = dto.kind ?? CommunityPostKind.TEXT;
    this.assertKindPayload(kind, dto);
    await this.assertNotFlooding(user.id);

    const slug = await uniqueSlug(dto.title, async (candidate) => {
      const clash = await this.prisma.communityPost.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      return Boolean(clash);
    });

    const post = await this.prisma.$transaction(async (tx) => {
      const created = await tx.communityPost.create({
        data: {
          userId: user.id,
          categoryId: category.id,
          title: sanitizePlainText(dto.title),
          slug,
          body: sanitizeRichText(dto.body),
          kind,
        },
      });

      if (dto.poll) {
        const poll = await tx.poll.create({
          data: {
            postId: created.id,
            question: sanitizePlainText(dto.poll.question),
            allowMultiple: dto.poll.allowMultiple ?? false,
            closesAt: dto.poll.closesAt ? new Date(dto.poll.closesAt) : null,
          },
        });
        await tx.pollOption.createMany({
          data: dto.poll.options.map((option, index) => ({
            pollId: poll.id,
            text: sanitizePlainText(option.text),
            animeId: option.animeId ?? null,
            order: index,
          })),
        });
      }

      if (dto.tierList?.length) {
        await tx.tierListItem.createMany({
          data: dto.tierList.map((item, index) => ({
            postId: created.id,
            tier: item.tier,
            label: sanitizePlainText(item.label),
            animeId: item.animeId ?? null,
            order: index,
          })),
        });
      }

      if (dto.animeIds?.length) {
        await tx.communityPostAnime.createMany({
          data: dto.animeIds.map((animeId, index) => ({ postId: created.id, animeId, order: index })),
          skipDuplicates: true,
        });
      }

      return created;
    });

    await this.mana.award(user.id, ManaEvent.COMMUNITY_POST, { reason: 'Created a community post' });
    return this.findPost(post.slug, user.id);
  }

  async updatePost(user: AuthenticatedUser, slug: string, dto: UpdatePostDto) {
    const post = await this.prisma.communityPost.findUnique({ where: { slug } });
    if (!post || post.isDeleted) throw new NotFoundException('Post not found');
    if (post.userId !== user.id && user.role === UserRole.USER) {
      throw new ForbiddenException('You can only edit your own posts');
    }
    if (post.isLocked && user.role === UserRole.USER) {
      throw new ForbiddenException('This post is locked');
    }

    await this.prisma.communityPost.update({
      where: { id: post.id },
      data: {
        ...(dto.title ? { title: sanitizePlainText(dto.title) } : {}),
        ...(dto.body ? { body: sanitizeRichText(dto.body) } : {}),
        isEdited: true,
      },
    });
    return this.findPost(slug, user.id);
  }

  async deletePost(user: AuthenticatedUser, slug: string) {
    const post = await this.prisma.communityPost.findUnique({ where: { slug } });
    if (!post || post.isDeleted) throw new NotFoundException('Post not found');

    const isOwner = post.userId === user.id;
    if (!isOwner && user.role === UserRole.USER) {
      throw new ForbiddenException('You can only delete your own posts');
    }

    await this.prisma.communityPost.update({
      where: { id: post.id },
      data: {
        isDeleted: true,
        deletedReason: isOwner ? 'Removed by author' : `Removed by ${user.role.toLowerCase()}`,
      },
    });
    return { deleted: true };
  }

  async votePost(userId: string, slug: string, value: 1 | -1) {
    const post = await this.prisma.communityPost.findUnique({
      where: { slug },
      select: { id: true, userId: true, isDeleted: true },
    });
    if (!post || post.isDeleted) throw new NotFoundException('Post not found');
    if (post.userId === userId) throw new BadRequestException('You cannot vote on your own post');

    const existing = await this.prisma.communityVote.findUnique({
      where: { userId_postId: { userId, postId: post.id } },
    });

    if (existing?.value === value) {
      await this.prisma.$transaction([
        this.prisma.communityVote.delete({ where: { id: existing.id } }),
        this.prisma.communityPost.update({
          where: { id: post.id },
          data: value === 1 ? { upvoteCount: { decrement: 1 } } : { downvoteCount: { decrement: 1 } },
        }),
      ]);
      if (value === 1) {
        await this.mana.revoke(post.userId, ManaEvent.RECEIVED_UPVOTE, `POST_UPVOTE:${post.id}:${userId}`);
      }
      return this.postVoteState(post.id, null);
    }

    if (existing) {
      await this.prisma.$transaction([
        this.prisma.communityVote.update({ where: { id: existing.id }, data: { value } }),
        this.prisma.communityPost.update({
          where: { id: post.id },
          data:
            value === 1
              ? { upvoteCount: { increment: 1 }, downvoteCount: { decrement: 1 } }
              : { upvoteCount: { decrement: 1 }, downvoteCount: { increment: 1 } },
        }),
      ]);
    } else {
      await this.prisma.$transaction([
        this.prisma.communityVote.create({ data: { userId, postId: post.id, value } }),
        this.prisma.communityPost.update({
          where: { id: post.id },
          data: value === 1 ? { upvoteCount: { increment: 1 } } : { downvoteCount: { increment: 1 } },
        }),
      ]);
    }

    if (value === 1) {
      await this.mana.award(post.userId, ManaEvent.RECEIVED_UPVOTE, {
        dedupeKey: `POST_UPVOTE:${post.id}:${userId}`,
        reason: 'Post received an upvote',
      });
    }
    return this.postVoteState(post.id, value);
  }

  async listComments(slug: string, page: number, limit: number, viewerId?: string) {
    const post = await this.prisma.communityPost.findUnique({ where: { slug }, select: { id: true } });
    if (!post) throw new NotFoundException('Post not found');

    const where: Prisma.CommunityCommentWhereInput = { postId: post.id, parentId: null, isDeleted: false };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.communityComment.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: AUTHOR_SELECT },
          replies: {
            where: { isDeleted: false },
            orderBy: { createdAt: 'asc' },
            include: { user: { select: AUTHOR_SELECT } },
          },
        },
      }),
      this.prisma.communityComment.count({ where }),
    ]);

    const ids = rows.flatMap((r) => [r.id, ...r.replies.map((x) => x.id)]);
    const myVotes = viewerId
      ? new Map(
          (
            await this.prisma.communityVote.findMany({
              where: { userId: viewerId, commentId: { in: ids } },
              select: { commentId: true, value: true },
            })
          ).map((v) => [v.commentId!, v.value]),
        )
      : new Map<string, number>();

    return paginate(
      rows.map((row) => ({
        id: row.id,
        body: row.body,
        author: row.user,
        upvoteCount: row.upvoteCount,
        replyCount: row.replyCount,
        isEdited: row.isEdited,
        createdAt: row.createdAt,
        myVote: myVotes.get(row.id) ?? null,
        replies: row.replies.map((reply) => ({
          id: reply.id,
          body: reply.body,
          author: reply.user,
          upvoteCount: reply.upvoteCount,
          isEdited: reply.isEdited,
          createdAt: reply.createdAt,
          myVote: myVotes.get(reply.id) ?? null,
        })),
      })),
      total,
      page,
      limit,
    );
  }

  async addComment(userId: string, slug: string, dto: CreateCommunityCommentDto) {
    const post = await this.prisma.communityPost.findUnique({
      where: { slug },
      select: { id: true, isDeleted: true, isLocked: true },
    });
    if (!post || post.isDeleted) throw new NotFoundException('Post not found');
    if (post.isLocked) throw new ForbiddenException('This discussion is locked');

    let parentId: string | null = null;
    if (dto.parentId) {
      const parent = await this.prisma.communityComment.findUnique({
        where: { id: dto.parentId },
        select: { id: true, postId: true, parentId: true, isDeleted: true },
      });
      if (!parent || parent.isDeleted || parent.postId !== post.id) {
        throw new NotFoundException('The comment you replied to no longer exists');
      }
      parentId = parent.parentId ?? parent.id;
    }

    const comment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.communityComment.create({
        data: { postId: post.id, userId, parentId, body: sanitizePlainText(dto.body) },
        include: { user: { select: AUTHOR_SELECT } },
      });
      await tx.communityPost.update({
        where: { id: post.id },
        data: { commentCount: { increment: 1 } },
      });
      if (parentId) {
        await tx.communityComment.update({ where: { id: parentId }, data: { replyCount: { increment: 1 } } });
      }
      return created;
    });

    await this.mana.award(userId, ManaEvent.COMMUNITY_COMMENT, { reason: 'Commented in the community' });

    return {
      id: comment.id,
      body: comment.body,
      author: comment.user,
      upvoteCount: 0,
      replyCount: 0,
      isEdited: false,
      createdAt: comment.createdAt,
      myVote: null,
      replies: [],
    };
  }

  async deleteComment(user: AuthenticatedUser, commentId: string) {
    const comment = await this.prisma.communityComment.findUnique({ where: { id: commentId } });
    if (!comment || comment.isDeleted) throw new NotFoundException('Comment not found');

    const isOwner = comment.userId === user.id;
    if (!isOwner && user.role === UserRole.USER) {
      throw new ForbiddenException('You can only delete your own comments');
    }

    await this.prisma.$transaction([
      this.prisma.communityComment.update({
        where: { id: commentId },
        data: { isDeleted: true, deletedReason: isOwner ? 'Removed by author' : 'Removed by staff' },
      }),
      this.prisma.communityPost.update({
        where: { id: comment.postId },
        data: { commentCount: { decrement: 1 } },
      }),
    ]);
    return { deleted: true };
  }

  async voteComment(userId: string, commentId: string, value: 1 | -1) {
    const comment = await this.prisma.communityComment.findUnique({
      where: { id: commentId },
      select: { id: true, userId: true, isDeleted: true },
    });
    if (!comment || comment.isDeleted) throw new NotFoundException('Comment not found');
    if (comment.userId === userId) throw new BadRequestException('You cannot vote on your own comment');

    const existing = await this.prisma.communityVote.findUnique({
      where: { userId_commentId: { userId, commentId } },
    });

    if (existing) {
      await this.prisma.$transaction([
        this.prisma.communityVote.delete({ where: { id: existing.id } }),
        this.prisma.communityComment.update({
          where: { id: commentId },
          data: { upvoteCount: { decrement: existing.value === 1 ? 1 : 0 } },
        }),
      ]);
      await this.mana.revoke(comment.userId, ManaEvent.RECEIVED_UPVOTE, `CCOMMENT_UPVOTE:${commentId}:${userId}`);
      return { upvoted: false };
    }

    await this.prisma.$transaction([
      this.prisma.communityVote.create({ data: { userId, commentId, value } }),
      this.prisma.communityComment.update({
        where: { id: commentId },
        data: { upvoteCount: { increment: value === 1 ? 1 : 0 } },
      }),
    ]);
    if (value === 1) {
      await this.mana.award(comment.userId, ManaEvent.RECEIVED_UPVOTE, {
        dedupeKey: `CCOMMENT_UPVOTE:${commentId}:${userId}`,
        reason: 'Comment received an upvote',
      });
    }
    return { upvoted: value === 1 };
  }

  private async postVoteState(postId: string, myVote: 1 | -1 | null) {
    const post = await this.prisma.communityPost.findUnique({
      where: { id: postId },
      select: { upvoteCount: true, downvoteCount: true },
    });
    return { ...post, myVote };
  }

  private async postVotesOf(userId: string | undefined, postIds: string[]) {
    if (!userId || postIds.length === 0) return new Map<string, number>();
    const votes = await this.prisma.communityVote.findMany({
      where: { userId, postId: { in: postIds } },
      select: { postId: true, value: true },
    });
    return new Map(votes.map((v) => [v.postId!, v.value]));
  }

  private postOrder(sort: CommunitySort): Prisma.CommunityPostOrderByWithRelationInput[] {
    switch (sort) {
      case CommunitySort.OLDEST:
        return [{ isPinned: 'desc' }, { createdAt: 'asc' }];
      case CommunitySort.TOP:
        return [{ isPinned: 'desc' }, { upvoteCount: 'desc' }, { createdAt: 'desc' }];
      case CommunitySort.ACTIVE:
        return [{ isPinned: 'desc' }, { commentCount: 'desc' }, { updatedAt: 'desc' }];
      default:
        return [{ isPinned: 'desc' }, { createdAt: 'desc' }];
    }
  }

  private assertKindPayload(kind: CommunityPostKind, dto: CreatePostDto): void {
    if ((kind === CommunityPostKind.POLL || kind === CommunityPostKind.MATCHUP) && !dto.poll) {
      throw new BadRequestException(`A ${kind.toLowerCase()} post requires poll options`);
    }
    // A matchup is a head-to-head, which is exactly a two-option poll.
    if (kind === CommunityPostKind.MATCHUP && dto.poll && dto.poll.options.length !== 2) {
      throw new BadRequestException('A matchup must have exactly two options');
    }
    if (kind === CommunityPostKind.TIER_LIST && !dto.tierList?.length) {
      throw new BadRequestException('A tier list post requires at least one entry');
    }
    if (kind === CommunityPostKind.RECOMMENDATION && !dto.animeIds?.length) {
      throw new BadRequestException('A recommendation post must reference at least one title');
    }
  }

  private async assertNotFlooding(userId: string): Promise<void> {
    const since = new Date(Date.now() - 10 * 60 * 1000);
    const recent = await this.prisma.communityPost.count({
      where: { userId, createdAt: { gte: since } },
    });
    if (recent >= 3) {
      throw new BadRequestException('You are posting too quickly. Please wait a few minutes.');
    }
  }
}
