import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ManaEvent } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { ManaService } from '../mana/mana.service';

@Injectable()
export class PollsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mana: ManaService,
  ) {}

  /**
   * Casting a vote replaces any previous vote by the same user on the same
   * poll, so a user can change their mind but can never double-count. The
   * unique constraint on (pollOptionId, userId) is the backstop against a race.
   */
  async vote(userId: string, pollId: string, optionIds: string[]) {
    const poll = await this.prisma.poll.findUnique({
      where: { id: pollId },
      include: { options: { select: { id: true } } },
    });
    if (!poll) throw new NotFoundException('Poll not found');
    if (poll.closesAt && poll.closesAt < new Date()) {
      throw new BadRequestException('This poll has closed');
    }

    const valid = new Set(poll.options.map((o) => o.id));
    const selected = [...new Set(optionIds)].filter((id) => valid.has(id));
    if (selected.length === 0) {
      throw new BadRequestException('Select at least one valid option');
    }
    if (!poll.allowMultiple && selected.length > 1) {
      throw new BadRequestException('This poll only allows a single choice');
    }

    const previous = await this.prisma.pollVote.findMany({
      where: { pollId, userId },
      select: { id: true, pollOptionId: true },
    });

    await this.prisma.$transaction(async (tx) => {
      if (previous.length) {
        await tx.pollVote.deleteMany({ where: { id: { in: previous.map((p) => p.id) } } });
        for (const vote of previous) {
          await tx.pollOption.update({
            where: { id: vote.pollOptionId },
            data: { voteCount: { decrement: 1 } },
          });
        }
      }

      await tx.pollVote.createMany({
        data: selected.map((pollOptionId) => ({ pollId, pollOptionId, userId })),
        skipDuplicates: true,
      });
      for (const optionId of selected) {
        await tx.pollOption.update({ where: { id: optionId }, data: { voteCount: { increment: 1 } } });
      }

      const total = await tx.pollVote.groupBy({ by: ['userId'], where: { pollId } });
      await tx.poll.update({ where: { id: pollId }, data: { totalVotes: total.length } });
    });

    if (previous.length === 0) {
      await this.mana.award(userId, ManaEvent.POLL_VOTE, {
        dedupeKey: `POLL_VOTE:${pollId}`,
        reason: 'Voted in a poll',
      });
    }

    return this.results(pollId, userId);
  }

  async results(pollId: string, userId?: string) {
    const poll = await this.prisma.poll.findUnique({
      where: { id: pollId },
      include: {
        options: {
          orderBy: { order: 'asc' },
          include: { anime: { select: { id: true, slug: true, titleEnglish: true, posterUrl: true } } },
        },
      },
    });
    if (!poll) throw new NotFoundException('Poll not found');

    const myVotes = userId
      ? await this.prisma.pollVote.findMany({
          where: { pollId, userId },
          select: { pollOptionId: true },
        })
      : [];

    return {
      id: poll.id,
      question: poll.question,
      allowMultiple: poll.allowMultiple,
      totalVotes: poll.totalVotes,
      closesAt: poll.closesAt,
      isClosed: Boolean(poll.closesAt && poll.closesAt < new Date()),
      hasVoted: myVotes.length > 0,
      myVotes: myVotes.map((v) => v.pollOptionId),
      options: poll.options.map((option) => ({
        id: option.id,
        text: option.text,
        imageUrl: option.imageUrl,
        voteCount: option.voteCount,
        percent: poll.totalVotes > 0 ? Math.round((option.voteCount / poll.totalVotes) * 100) : 0,
        anime: option.anime,
      })),
    };
  }
}
