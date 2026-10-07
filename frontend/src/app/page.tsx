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
import { createLoader } from '@/lib/unavailable';

/**
 * Rendered per request, with the catalogue data itself cached.
 *
 * It used to be a prerendered page revalidated every two minutes. That tied two
 * unrelated things to one mechanism: a build could not finish unless the API
 * answered, and a build is exactly when the API is least likely to — a deploy
 * while the backend is down failed at prerender. The data is still cached by the
 * per-request `revalidate` on each fetch below, so the backend is asked no more
 * often than before; only the HTML is assembled per request.
 */
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const emptyPage: Paginated<AnimeCardType> = {
    data: [],
    meta: { page: 1, limit: 0, total: 0, totalPages: 0, hasPrevious: false, hasNext: false },
  };

  // A single failing rail still degrades quietly; everything failing does not,
  // because that is the API being unreachable rather than an empty catalogue,
  // and Next must not be handed a hollow page to cache.
  const loader = createLoader();
  const safe = loader.settle;

  const [featured, latest, trending, top, newest, added, popular, posts] = await Promise.all([
    safe(apiFetch<FeaturedEntry[]>('/anime/featured', { revalidate: 120 }), []),
    safe(
      apiFetch<Paginated<LatestEpisode>>(`/episodes/latest${qs({ limit: 12 })}`, { revalidate: 60 }),
      { ...emptyPage, data: [] } as unknown as Paginated<LatestEpisode>,
    ),
    safe(apiFetch<AnimeCardType[]>(`/anime/trending${qs({ period: 'week', limit: 14 })}`, { revalidate: 300 }), []),
    safe(apiFetch<AnimeCardType[]>(`/anime/top${qs({ period: 'week', limit: 10 })}`, { revalidate: 300 }), []),
    safe(apiFetch<Paginated<AnimeCardType>>(`/anime${qs({ sort: 'release', limit: 14 })}`, { revalidate: 300 }), emptyPage),
    safe(apiFetch<Paginated<AnimeCardType>>(`/anime${qs({ sort: 'added', limit: 14 })}`, { revalidate: 300 }), emptyPage),
    safe(apiFetch<Paginated<AnimeCardType>>(`/anime${qs({ sort: 'views', limit: 10 })}`, { revalidate: 300 }), emptyPage),
    safe(
      apiFetch<Paginated<CommunityPostSummary>>(`/community/posts${qs({ limit: 5, sort: 'newest' })}`, {
        revalidate: 120,
      }),
      { ...emptyPage, data: [] } as unknown as Paginated<CommunityPostSummary>,
    ),
  ]);

  loader.assertAnythingLoaded();

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
