import { SmartImage as Image } from '@/components/ui/SmartImage';
import Link from 'next/link';
import type { CommunityPostSummary } from '@/lib/types';
import { formatRelativeTime } from '@/lib/utils';

const KIND_LABELS: Record<CommunityPostSummary['kind'], string | null> = {
  TEXT: null,
  POLL: 'Poll',
  TIER_LIST: 'Tier List',
  MATCHUP: 'Matchup',
  RECOMMENDATION: 'Recommendation',
};

export function PostRow({ post }: { post: CommunityPostSummary }) {
  const kindLabel = KIND_LABELS[post.kind];

  return (
    <li className="card-surface overflow-hidden transition-colors hover:border-brand/40">
      <Link href={`/community/${post.slug}`} className="block p-4">
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span
            className="rounded px-1.5 py-0.5 font-bold uppercase tracking-wide"
            style={{
              background: `${post.category.color ?? '#7c5cff'}22`,
              color: post.category.color ?? '#7c5cff',
            }}
          >
            {post.category.icon} {post.category.name}
          </span>
          {kindLabel ? (
            <span className="rounded bg-surface-2 px-1.5 py-0.5 font-semibold text-ink-muted">{kindLabel}</span>
          ) : null}
          {post.isPinned ? (
            <span className="rounded bg-gold/20 px-1.5 py-0.5 font-bold text-gold">Pinned</span>
          ) : null}
          {post.isLocked ? (
            <span className="rounded bg-surface-2 px-1.5 py-0.5 font-semibold text-ink-faint">Locked</span>
          ) : null}
        </div>

        <h2 className="clamp-2 mt-2 text-[15px] font-bold leading-snug text-ink">{post.title}</h2>
        <p className="clamp-2 mt-1 text-[13px] leading-relaxed text-ink-muted">{post.excerpt}</p>

        {post.anime.length > 0 ? (
          <div className="mt-2.5 flex gap-1.5">
            {post.anime.slice(0, 5).map((anime) => (
              <span key={anime.id} className="relative h-14 w-10 overflow-hidden rounded bg-surface-2">
                {anime.posterUrl ? (
                  <Image src={anime.posterUrl} alt={anime.titleEnglish} fill sizes="40px" className="object-cover" />
                ) : null}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[11.5px] text-ink-faint">
          <span className="flex items-center gap-1.5">
            <span className="relative h-5 w-5 overflow-hidden rounded-full bg-surface-2">
              {post.author.avatarUrl ? (
                <Image src={post.author.avatarUrl} alt="" fill sizes="20px" className="object-cover" />
              ) : null}
            </span>
            <span className="text-ink-muted">{post.author.displayName ?? post.author.username}</span>
            {post.author.rank ? (
              <span style={{ color: post.author.rank.color ?? undefined }}>{post.author.rank.icon}</span>
            ) : null}
          </span>

          <span>{formatRelativeTime(post.createdAt)}</span>

          <span className="flex items-center gap-1">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M12 5 4.5 14h15L12 5Z" strokeLinejoin="round" />
            </svg>
            {post.upvoteCount}
          </span>

          <span className="flex items-center gap-1">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M21 12a8 8 0 0 1-8 8H4l2-3.2A8 8 0 1 1 21 12Z" strokeLinejoin="round" />
            </svg>
            {post.commentCount}
          </span>

          {post.poll ? (
            <span className="flex items-center gap-1 text-accent">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M5 20V10M12 20V4M19 20v-6" strokeLinecap="round" />
              </svg>
              {post.poll.totalVotes} votes
            </span>
          ) : null}
        </div>
      </Link>
    </li>
  );
}
