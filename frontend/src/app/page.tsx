import Link from 'next/link';
import { apiFetch, qs } from '@/lib/api';
import type {
  AnimeCard as AnimeCardType,
  CommunityPostSummary,
  FeaturedEntry,
  LatestEpisode,
  Paginated,
} from '@/lib/types';
import { AdSlot } from '@/components/ads/AdSlot';
import { AnimeRail } from '@/components/anime/AnimeRail';
import { HeroSlider } from '@/components/anime/HeroSlider';
import { RankedList } from '@/components/anime/RankedList';
import { SectionHeader } from '@/components/anime/SectionHeader';
import { ContinueWatchingLazy } from '@/components/home/ContinueWatchingLazy';
import { LatestEpisodesSection } from '@/components/home/LatestEpisodesSection';
import { TopAnimeSection } from '@/components/home/TopAnimeSection';
import { AzStrip } from '@/components/anime/AzStrip';
import { formatRelativeTime } from '@/lib/utils';

// The homepage is fully static between revalidations — every section below is
// catalogue data that changes on publish, not per request.
export const revalidate = 120;

async function safe<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch {
    // A single failing rail must not take the whole homepage down.
    return fallback;
  }
}

export default async function HomePage() {
  const emptyPage: Paginated<AnimeCardType> = {
    data: [],
    meta: { page: 1, limit: 0, total: 0, totalPages: 0, hasPrevious: false, hasNext: false },
  };

  const [featured, latest, trending, top, newest, added, completed, upcoming, popular, posts] = await Promise.all([
    safe(apiFetch<FeaturedEntry[]>('/anime/featured', { revalidate: 120 }), []),
    safe(
      apiFetch<Paginated<LatestEpisode>>(`/episodes/latest${qs({ limit: 12 })}`, { revalidate: 60 }),
      { ...emptyPage, data: [] } as unknown as Paginated<LatestEpisode>,
    ),
    safe(apiFetch<AnimeCardType[]>(`/anime/trending${qs({ period: 'week', limit: 14 })}`, { revalidate: 300 }), []),
    safe(apiFetch<AnimeCardType[]>(`/anime/top${qs({ period: 'week', limit: 10 })}`, { revalidate: 300 }), []),
    safe(apiFetch<Paginated<AnimeCardType>>(`/anime${qs({ sort: 'release', limit: 14 })}`, { revalidate: 300 }), emptyPage),
    safe(apiFetch<Paginated<AnimeCardType>>(`/anime${qs({ sort: 'added', limit: 14 })}`, { revalidate: 300 }), emptyPage),
    safe(
      apiFetch<Paginated<AnimeCardType>>(`/anime${qs({ status: 'COMPLETED', sort: 'updated', limit: 14 })}`, {
        revalidate: 300,
      }),
      emptyPage,
    ),
    safe(
      apiFetch<Paginated<AnimeCardType>>(`/anime${qs({ status: 'UPCOMING', sort: 'release', limit: 14 })}`, {
        revalidate: 300,
      }),
      emptyPage,
    ),
    safe(apiFetch<Paginated<AnimeCardType>>(`/anime${qs({ sort: 'views', limit: 10 })}`, { revalidate: 300 }), emptyPage),
    safe(
      apiFetch<Paginated<CommunityPostSummary>>(`/community/posts${qs({ limit: 5, sort: 'newest' })}`, {
        revalidate: 120,
      }),
      { ...emptyPage, data: [] } as unknown as Paginated<CommunityPostSummary>,
    ),
  ]);

  return (
    <>
      <HeroSlider entries={featured} />

      <div className="mx-auto max-w-[1600px] space-y-14 px-4 pt-10 pb-16 md:px-6">
        <AdSlot placementKey="home_below_hero" format="leaderboard" className="-mt-6" />

        <ContinueWatchingLazy />

        <LatestEpisodesSection initial={latest.data} />

        <AdSlot placementKey="home_in_feed" format="in-feed" />

        {/* Main column plus ranking sidebar on large screens. */}
        <div className="grid gap-12 xl:grid-cols-[minmax(0,1fr)_20rem]">
          {/* min-w-0: a grid item defaults to min-width:auto, which lets the
              horizontally scrolling rails inside stretch the whole page on
              narrow screens instead of scrolling within themselves. */}
          <div className="min-w-0 space-y-12">
            {trending.length > 0 ? (
              <section>
                <SectionHeader title="Trending Now" subtitle="Most watched this week" href="/browse?sort=trending" />
                <AnimeRail items={trending} />
              </section>
            ) : null}

            {newest.data.length > 0 ? (
              <section>
                <SectionHeader title="New Releases" href="/browse?sort=release" />
                <AnimeRail items={newest.data} />
              </section>
            ) : null}

            <AdSlot placementKey="home_between_grids" format="leaderboard" />

            {added.data.length > 0 ? (
              <section>
                <SectionHeader title="Newly Added" href="/browse?sort=added" />
                <AnimeRail items={added.data} />
              </section>
            ) : null}

            {upcoming.data.length > 0 ? (
              <section>
                <SectionHeader title="Upcoming" subtitle="Announced, not yet airing" href="/browse?status=UPCOMING" />
                <AnimeRail items={upcoming.data} />
              </section>
            ) : null}

            {completed.data.length > 0 ? (
              <section>
                <SectionHeader title="Just Completed" href="/browse?status=COMPLETED" />
                <AnimeRail items={completed.data} />
              </section>
            ) : null}
          </div>

          <aside className="space-y-10">
            <TopAnimeSection initial={top} />

            {popular.data.length > 0 ? (
              <section>
                <SectionHeader title="Most Viewed" href="/browse?sort=views" />
                <RankedList items={popular.data} />
              </section>
            ) : null}

            {posts.data.length > 0 ? (
              <section>
                <SectionHeader title="From the Community" href="/community" linkLabel="Board" />
                <ul className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line-soft bg-surface/50">
                  {posts.data.map((post) => (
                    <li key={post.id}>
                      <Link href={`/community/${post.slug}`} className="block px-3.5 py-3 transition hover:bg-white/5">
                        <span
                          className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                          style={{
                            background: `${post.category.color ?? '#7c5cff'}22`,
                            color: post.category.color ?? '#7c5cff',
                          }}
                        >
                          {post.category.name}
                        </span>
                        <span className="clamp-2 mt-1.5 block text-[13px] font-semibold leading-snug text-ink">
                          {post.title}
                        </span>
                        <span className="mt-1 block text-[11px] text-ink-faint">
                          {post.author.displayName ?? post.author.username} · {formatRelativeTime(post.createdAt)} ·{' '}
                          {post.commentCount} replies
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <AdSlot placementKey="watch_sidebar" format="rectangle" className="hidden xl:block" />
          </aside>
        </div>

        <section>
          <SectionHeader title="Browse A-Z" subtitle="Jump to titles by first letter" href="/az" />
          <AzStrip />
        </section>

        <AdSlot placementKey="home_footer" format="leaderboard" />
      </div>
    </>
  );
}
