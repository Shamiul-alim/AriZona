import type { Metadata } from 'next';
import { SmartImage as Image } from '@/components/ui/SmartImage';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiFetchOrNull, qs } from '@/lib/api';
import type { PublicProfile, WatchStatus } from '@/lib/types';
import { formatCount, formatDate, formatRelativeTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface ActivityItem {
  type: 'comment' | 'post';
  createdAt: string;
  body?: string;
  anime?: { slug: string; titleEnglish: string; posterUrl: string | null } | null;
  episodeNumber?: number | null;
  title?: string;
  slug?: string;
  category?: { name: string; color: string | null };
}

const STATUS_LABELS: Record<WatchStatus, string> = {
  WATCHING: 'Watching',
  COMPLETED: 'Completed',
  PLAN_TO_WATCH: 'Plan to Watch',
  ON_HOLD: 'On Hold',
  DROPPED: 'Dropped',
};

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  const profile = await apiFetchOrNull<PublicProfile>(`/users/${username}`);
  if (!profile) return { title: 'User not found' };

  return {
    title: `${profile.displayName ?? profile.username}`,
    description: profile.bio ?? `${profile.username}'s profile.`,
    alternates: { canonical: `/user/${profile.username}` },
  };
}

export default async function UserProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;

  const profile = await apiFetchOrNull<PublicProfile>(`/users/${username}`);
  if (!profile) notFound();

  const activity = await apiFetchOrNull<{ data: ActivityItem[] }>(`/users/${username}/activity${qs({ limit: 20 })}`);

  const totalWatchlist = Object.values(profile.stats.watchlist).reduce((sum, n) => sum + n, 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-6">
      <section className="card-surface overflow-hidden">
        <div className="relative h-32 bg-gradient-to-r from-brand/30 via-surface-3 to-accent/20">
          {profile.bannerUrl ? (
            <Image src={profile.bannerUrl} alt="" fill sizes="100vw" className="object-cover" />
          ) : null}
        </div>

        <div className="flex flex-wrap items-end gap-4 px-5 pb-5">
          <span className="relative -mt-12 h-24 w-24 shrink-0 overflow-hidden rounded-2xl ring-4 ring-surface">
            {profile.avatarUrl ? (
              <Image src={profile.avatarUrl} alt="" fill sizes="96px" className="object-cover" />
            ) : (
              <span className="grid h-full w-full place-items-center bg-surface-3 text-[2rem] font-bold text-ink">
                {profile.username[0]?.toUpperCase()}
              </span>
            )}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[1.3rem] font-extrabold text-ink">{profile.displayName ?? profile.username}</h1>
              {profile.role !== 'USER' ? (
                <span className="rounded bg-brand/20 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-brand-bright">
                  {profile.role === 'MODERATOR' ? 'Moderator' : 'Staff'}
                </span>
              ) : null}
            </div>
            <p className="text-[12.5px] text-ink-faint">
              @{profile.username} · joined {formatDate(profile.createdAt)}
            </p>
            {profile.bio ? (
              <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-ink-soft">{profile.bio}</p>
            ) : null}
          </div>
        </div>

        <div className="border-t border-line-soft px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span
              className="flex items-center gap-2 text-[13px] font-semibold"
              style={{ color: profile.rank?.color ?? undefined }}
            >
              <span aria-hidden="true">{profile.rank?.icon}</span>
              {profile.rank?.name ?? 'Unranked'}
            </span>
            <span className="text-[13px] font-bold text-accent">{formatCount(profile.mana)} Mana</span>
          </div>

          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand to-accent"
              style={{ width: `${profile.rankProgressPercent}%` }}
            />
          </div>

          <p className="mt-1.5 text-[11.5px] text-ink-faint">
            {profile.nextRank
              ? `${formatCount(profile.nextRank.requiredMana! - profile.mana)} Mana to ${profile.nextRank.icon} ${profile.nextRank.name}`
              : 'Highest rank reached.'}
          </p>
        </div>
      </section>

      <section className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label="On their list" value={totalWatchlist} />
        <Stat label="Favourites" value={profile.stats.favorites} />
        <Stat label="Comments" value={profile.stats.comments} />
        <Stat label="Posts" value={profile.stats.posts} />
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-ink-faint">List breakdown</h2>
        <div className="card-surface divide-y divide-line-soft overflow-hidden">
          {(Object.keys(STATUS_LABELS) as WatchStatus[]).map((status) => (
            <div key={status} className="flex items-center gap-3 px-4 py-2.5">
              <span className="min-w-0 flex-1 text-[13px] text-ink-soft">{STATUS_LABELS[status]}</span>
              <span className="h-1.5 w-32 overflow-hidden rounded-full bg-surface-2">
                <span
                  className="block h-full rounded-full bg-brand-bright"
                  style={{
                    width: totalWatchlist > 0 ? `${(profile.stats.watchlist[status] / totalWatchlist) * 100}%` : '0%',
                  }}
                />
              </span>
              <span className="w-8 shrink-0 text-right text-[13px] font-bold tabular-nums text-ink">
                {profile.stats.watchlist[status]}
              </span>
            </div>
          ))}
        </div>
      </section>

      {activity && activity.data.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-ink-faint">Recent activity</h2>
          <ul className="card-surface divide-y divide-line-soft overflow-hidden">
            {activity.data.map((item, index) => (
              <li key={`${item.type}-${index}`} className="flex gap-3 px-4 py-3">
                <span
                  className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.type === 'post' ? 'bg-accent' : 'bg-brand'}`}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  {item.type === 'post' ? (
                    <>
                      <Link
                        href={`/community/${item.slug}`}
                        className="clamp-2 text-[13.5px] font-semibold text-ink transition hover:text-brand-bright"
                      >
                        {item.title}
                      </Link>
                      <p className="mt-0.5 text-[11.5px] text-ink-faint">
                        Posted in {item.category?.name} · {formatRelativeTime(item.createdAt)}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="clamp-2 text-[13.5px] leading-relaxed text-ink-soft">{item.body}</p>
                      <p className="mt-0.5 text-[11.5px] text-ink-faint">
                        {item.anime ? (
                          <>
                            Commented on{' '}
                            <Link href={`/anime/${item.anime.slug}`} className="text-brand-bright hover:underline">
                              {item.anime.titleEnglish}
                            </Link>
                            {item.episodeNumber ? ` episode ${item.episodeNumber}` : ''}
                          </>
                        ) : (
                          'Commented'
                        )}{' '}
                        · {formatRelativeTime(item.createdAt)}
                      </p>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card-surface px-4 py-3.5 text-center">
      <span className="block text-[1.4rem] font-extrabold text-ink">{formatCount(value)}</span>
      <span className="mt-0.5 block text-[12px] text-ink-muted">{label}</span>
    </div>
  );
}
