import type { Metadata } from 'next';
import { apiFetch, qs } from '@/lib/api';
import type { AnimeCard, Paginated } from '@/lib/types';
import { AdSlot } from '@/components/ads/AdSlot';
import { AnimeGrid } from '@/components/anime/AnimeGrid';
import { FilterPanel } from '@/components/browse/FilterPanel';
import { Pagination } from '@/components/ui/Pagination';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const params = await searchParams;
  const q = first(params.q);
  const status = first(params.status);
  const type = first(params.type);

  const title = q
    ? `Search results for “${q}”`
    : status
      ? `${status.charAt(0)}${status.slice(1).toLowerCase()} anime`
      : type
        ? `${type.replace('_', ' ')} anime`
        : 'Browse anime';

  return {
    title,
    description: 'Filter the catalogue by genre, season, year, type, status, language, rating and source.',
    alternates: { canonical: `/browse${qs(normalise(params))}` },
  };
}

function normalise(params: SearchParams): Record<string, string | undefined> {
  const keys = [
    'q',
    'genres',
    'type',
    'status',
    'season',
    'year',
    'ageRating',
    'source',
    'language',
    'studio',
    'producer',
    'minEpisodes',
    'maxEpisodes',
    'letter',
    'sort',
    'hideInList',
    'page',
    'limit',
  ];
  const result: Record<string, string | undefined> = {};
  for (const key of keys) {
    const value = first(params[key]);
    if (value) result[key] = value;
  }
  return result;
}

export default async function BrowsePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const query = normalise(params);
  const page = Number(query.page ?? 1);

  const [results, years] = await Promise.all([
    apiFetch<Paginated<AnimeCard>>(`/anime${qs({ ...query, limit: query.limit ?? 28 })}`).catch(() => ({
      data: [],
      meta: { page: 1, limit: 28, total: 0, totalPages: 0, hasPrevious: false, hasNext: false },
    })),
    apiFetch<number[]>('/years', { revalidate: 3600 }).catch(() => []),
  ]);

  const buildHref = (target: number) => `/browse${qs({ ...query, page: target === 1 ? undefined : target })}`;

  const heading = query.q
    ? `Results for “${query.q}”`
    : query.status
      ? `${query.status.charAt(0)}${query.status.slice(1).toLowerCase()} anime`
      : 'Browse anime';

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-8 md:px-6">
      <header className="mb-5">
        <h1 className="text-[1.6rem] font-extrabold text-ink md:text-[2rem]">{heading}</h1>
        <p className="mt-1 text-[13.5px] text-ink-muted">
          {results.meta.total.toLocaleString()} {results.meta.total === 1 ? 'title' : 'titles'} found
          {page > 1 ? ` · page ${page} of ${results.meta.totalPages}` : ''}
        </p>
      </header>

      <FilterPanel years={years} />

      <div className="my-6">
        <AdSlot placementKey="browse_top" format="leaderboard" />
      </div>

      <AnimeGrid
        items={results.data}
        priorityCount={7}
        emptyMessage={query.q ? `Nothing matches “${query.q}”` : 'No titles match these filters'}
      />

      <Pagination meta={results.meta} buildHref={buildHref} />

      <div className="mt-10">
        <AdSlot placementKey="search_results" format="leaderboard" />
      </div>
    </div>
  );
}
