import type { Metadata } from 'next';
import { apiFetch, qs } from '@/lib/api';
import type { AnimeCard, Paginated } from '@/lib/types';
import { AnimeGrid } from '@/components/anime/AnimeGrid';
import { AzStrip } from '@/components/anime/AzStrip';
import { Pagination } from '@/components/ui/Pagination';
import { AdSlot } from '@/components/ads/AdSlot';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : (value ?? undefined);
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }): Promise<Metadata> {
  const params = await searchParams;
  const letter = first(params.letter) ?? 'all';
  return {
    title: letter === 'all' ? 'A-Z anime list' : `Anime starting with ${letter}`,
    description: 'Browse the full catalogue alphabetically.',
    alternates: { canonical: `/az${letter === 'all' ? '' : `?letter=${encodeURIComponent(letter)}`}` },
  };
}

export default async function AzPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const letter = first(params.letter) ?? 'all';
  const page = Number(first(params.page) ?? 1);

  const results = await apiFetch<Paginated<AnimeCard>>(
    `/anime${qs({ letter, sort: 'name', page, limit: 28 })}`,
  ).catch(() => ({
    data: [],
    meta: { page: 1, limit: 28, total: 0, totalPages: 0, hasPrevious: false, hasNext: false },
  }));

  const buildHref = (target: number) =>
    `/az${qs({ letter: letter === 'all' ? undefined : letter, page: target === 1 ? undefined : target })}`;

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-8 md:px-6">
      <header className="mb-5">
        <h1 className="text-[1.6rem] font-extrabold text-ink md:text-[2rem]">A-Z List</h1>
        <p className="mt-1 text-[13.5px] text-ink-muted">
          Browse every title alphabetically. {results.meta.total.toLocaleString()} in this view.
        </p>
      </header>

      <div className="mb-7">
        <AzStrip active={letter} />
      </div>

      <AnimeGrid items={results.data} priorityCount={7} emptyMessage={`No titles start with “${letter}”`} />

      <Pagination meta={results.meta} buildHref={buildHref} />

      <div className="mt-10">
        <AdSlot placementKey="browse_in_grid" format="leaderboard" />
      </div>
    </div>
  );
}
