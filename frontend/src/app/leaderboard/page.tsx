import type { Metadata } from 'next';
import { SmartImage as Image } from '@/components/ui/SmartImage';
import Link from 'next/link';
import { apiFetch, qs } from '@/lib/api';
import { cn, formatCount, formatRelativeTime } from '@/lib/utils';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Leaderboard',
  description: 'Top Mana holders, most active members, most upvoted contributors and popular community posts.',
  alternates: { canonical: '/leaderboard' },
};

interface LeaderUser {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  mana: number;
  createdAt: string;
  rank: { name: string; icon: string | null; color: string | null } | null;
  earnedInPeriod?: number;
  totalUpvotes?: number;
  postCount?: number;
}

interface LeaderboardResponse {
  period: string;
  topMana: LeaderUser[];
  mostActive: LeaderUser[];
  mostUpvoted: LeaderUser[];
  contributors: LeaderUser[];
  popularPosts: Array<{
    slug: string;
    title: string;
    upvoteCount: number;
    commentCount: number;
    viewCount: number;
    createdAt: string;
    category: { name: string; slug: string; color: string | null };
    user: { username: string; displayName: string | null; avatarUrl: string | null };
  }>;
  ranks: Array<{
    id: string;
    name: string;
    requiredMana: number;
    icon: string | null;
    color: string | null;
    description: string | null;
    _count: { users: number };
  }>;
}

const PERIODS = [
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'all', label: 'All time' },
];

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.period) ? params.period[0] : params.period;
  const period = PERIODS.some((p) => p.value === raw) ? raw! : 'month';

  const data = await apiFetch<LeaderboardResponse>(`/leaderboard${qs({ period })}`, { revalidate: 300 }).catch(
    () => null,
  );

  if (!data) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center md:px-6">
        <h1 className="text-[1.6rem] font-extrabold text-ink">Leaderboard</h1>
        <p className="mt-2 text-[13.5px] text-ink-muted">The leaderboard is temporarily unavailable.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 md:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.6rem] font-extrabold text-ink md:text-[2rem]">Leaderboard</h1>
          <p className="mt-1 max-w-2xl text-[13.5px] text-ink-muted">
            Mana is earned by taking part — commenting, posting, voting and finishing episodes. Ranks are cosmetic;
            they just show who has been around.
          </p>
        </div>

        <div className="flex gap-1 rounded-xl bg-surface p-1 ring-1 ring-line-soft">
          {PERIODS.map((option) => (
            <Link
              key={option.value}
              href={`/leaderboard${option.value === 'month' ? '' : `?period=${option.value}`}`}
              className={
                period === option.value
                  ? 'rounded-lg bg-brand px-3 py-1.5 text-[12.5px] font-semibold text-white'
                  : 'rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-ink-muted transition hover:text-ink'
              }
            >
              {option.label}
            </Link>
          ))}
        </div>
      </header>

      {/* Podium */}
      {data.topMana.length >= 3 ? (
        <div className="mb-8 grid grid-cols-3 gap-3">
          {[data.topMana[1], data.topMana[0], data.topMana[2]].map((member, index) => {
            const place = index === 1 ? 1 : index === 0 ? 2 : 3;
            return (
              <Link
                key={member.id}
                href={`/user/${member.username}`}
                className={cn(
                  'card-surface flex flex-col items-center p-4 text-center transition hover:border-brand/40',
                  place === 1 && 'md:-mt-4 ring-1 ring-gold/40',
                )}
              >
                <span
                  className={cn(
                    'mb-2 grid h-7 w-7 place-items-center rounded-full text-[13px] font-extrabold',
                    place === 1 && 'bg-gold text-[#2a1c00]',
                    place === 2 && 'bg-ink-soft text-[#16161f]',
                    place === 3 && 'bg-[#c98b5e] text-[#2a1200]',
                  )}
                >
                  {place}
                </span>
                <span className={cn('relative overflow-hidden rounded-full bg-surface-2', place === 1 ? 'h-16 w-16' : 'h-12 w-12')}>
                  {member.avatarUrl ? (
                    <Image src={member.avatarUrl} alt="" fill sizes="64px" className="object-cover" />
                  ) : null}
                </span>
                <span className="clamp-2 mt-2 text-[13px] font-semibold text-ink">
                  {member.displayName ?? member.username}
                </span>
                <span className="mt-0.5 text-[12px] font-bold text-accent">{formatCount(member.mana)} Mana</span>
                {member.rank ? (
                  <span className="mt-1 text-[11px]" style={{ color: member.rank.color ?? undefined }}>
                    {member.rank.icon} {member.rank.name}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <Board title="Top Mana" subtitle="All-time balance" users={data.topMana} metric={(u) => `${formatCount(u.mana)} Mana`} />
        <Board
          title="Most active"
          subtitle={`Mana earned ${period === 'all' ? 'all time' : `this ${period}`}`}
          users={data.mostActive}
          metric={(u) => `+${formatCount(u.earnedInPeriod ?? 0)}`}
        />
        <Board
          title="Most upvoted"
          subtitle="Across comments and posts"
          users={data.mostUpvoted}
          metric={(u) => `${formatCount(u.totalUpvotes ?? 0)} upvotes`}
        />
        <Board
          title="Top contributors"
          subtitle="Community posts published"
          users={data.contributors}
          metric={(u) => `${u.postCount ?? 0} posts`}
        />

        <section className="card-surface overflow-hidden">
          <header className="border-b border-line-soft px-4 py-3">
            <h2 className="text-[14px] font-bold text-ink">Popular posts</h2>
            <p className="text-[11.5px] text-ink-faint">Most upvoted {period === 'all' ? 'ever' : `this ${period}`}</p>
          </header>
          {data.popularPosts.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-ink-faint">Nothing yet.</p>
          ) : (
            <ol className="divide-y divide-line-soft">
              {data.popularPosts.map((post, index) => (
                <li key={post.slug}>
                  <Link href={`/community/${post.slug}`} className="flex gap-3 px-4 py-2.5 transition hover:bg-white/5">
                    <span className="w-4 shrink-0 text-[13px] font-bold tabular-nums text-ink-faint">{index + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="clamp-2 block text-[13px] font-medium text-ink">{post.title}</span>
                      <span className="mt-0.5 block text-[11px] text-ink-faint">
                        {post.category.name} · {post.upvoteCount} upvotes · {post.commentCount} comments ·{' '}
                        {formatRelativeTime(post.createdAt)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="card-surface overflow-hidden">
          <header className="border-b border-line-soft px-4 py-3">
            <h2 className="text-[14px] font-bold text-ink">Rank ladder</h2>
            <p className="text-[11.5px] text-ink-faint">Mana needed for each rank</p>
          </header>
          <ol className="divide-y divide-line-soft">
            {data.ranks.map((rank) => (
              <li key={rank.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="text-[16px]" aria-hidden="true">
                  {rank.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold" style={{ color: rank.color ?? undefined }}>
                    {rank.name}
                  </span>
                  {rank.description ? (
                    <span className="block truncate text-[11px] text-ink-faint">{rank.description}</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[12px] font-bold tabular-nums text-ink-soft">
                    {formatCount(rank.requiredMana)}
                  </span>
                  <span className="block text-[10.5px] text-ink-faint">{rank._count.users} members</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}

function Board({
  title,
  subtitle,
  users,
  metric,
}: {
  title: string;
  subtitle: string;
  users: LeaderUser[];
  metric: (user: LeaderUser) => string;
}) {
  return (
    <section className="card-surface overflow-hidden">
      <header className="border-b border-line-soft px-4 py-3">
        <h2 className="text-[14px] font-bold text-ink">{title}</h2>
        <p className="text-[11.5px] text-ink-faint">{subtitle}</p>
      </header>

      {users.length === 0 ? (
        <p className="px-4 py-8 text-center text-[13px] text-ink-faint">Nothing to rank yet.</p>
      ) : (
        <ol className="divide-y divide-line-soft">
          {users.slice(0, 12).map((member, index) => (
            <li key={member.id}>
              <Link href={`/user/${member.username}`} className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-white/5">
                <span
                  className={cn(
                    'w-5 shrink-0 text-center text-[13px] font-bold tabular-nums',
                    index === 0 ? 'text-gold' : index < 3 ? 'text-ink-soft' : 'text-ink-faint',
                  )}
                >
                  {index + 1}
                </span>
                <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-surface-2">
                  {member.avatarUrl ? (
                    <Image src={member.avatarUrl} alt="" fill sizes="32px" className="object-cover" />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-ink">
                    {member.displayName ?? member.username}
                  </span>
                  {member.rank ? (
                    <span className="block text-[11px]" style={{ color: member.rank.color ?? undefined }}>
                      {member.rank.icon} {member.rank.name}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-[12px] font-bold tabular-nums text-accent">{metric(member)}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
