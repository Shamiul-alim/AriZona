import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { apiFetch, qs } from '@/lib/api';
import type { AnimeCard, Paginated } from '@/lib/types';
import { AnimeGrid } from '@/components/anime/AnimeGrid';
import { Pagination } from '@/components/ui/Pagination';
import { AdSlot } from '@/components/ads/AdSlot';

export const dynamic = 'force-dynamic';

interface GenreDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  animeCount?: number;
}

async function findGenre(slug: string): Promise<GenreDetail | null> {
  const genres = await apiFetch<GenreDetail[]>('/genres', { revalidate: 600 }).catch(() => []);
  return genres.find((g) => g.slug === slug) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const genre = await findGenre(slug);
  if (!genre) return { title: 'Genre not found' };

  return {
    title: `${genre.name} anime`,
    description: genre.description ?? `Browse every ${genre.name} title in the catalogue.`,
    alternates: { canonical: `/genres/${genre.slug}` },
  };
}

export default async function GenrePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const search = await searchParams;
  const page = Number((Array.isArray(search.page) ? search.page[0] : search.page) ?? 1);

  const genre = await findGenre(slug);
  if (!genre) notFound();

  const results = await apiFetch<Paginated<AnimeCard>>(
    `/anime${qs({ genres: slug, page, limit: 28, sort: 'updated' })}`,
  ).catch(() => ({
    data: [],
    meta: { page: 1, limit: 28, total: 0, totalPages: 0, hasPrevious: false, hasNext: false },
  }));

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-8 md:px-6">
      <header className="mb-6">
        <span
          className="inline-block rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider"
          style={{ background: `${genre.color ?? '#7c5cff'}22`, color: genre.color ?? '#7c5cff' }}
        >
          Genre
        </span>
        <h1 className="mt-2.5 text-[1.6rem] font-extrabold text-ink md:text-[2rem]">{genre.name}</h1>
        {genre.description ? (
          <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-ink-muted">{genre.description}</p>
        ) : null}
        <p className="mt-1 text-[13px] text-ink-faint">{results.meta.total.toLocaleString()} titles</p>
      </header>

      <AnimeGrid items={results.data} priorityCount={7} emptyMessage={`No ${genre.name} titles published yet`} />

      <Pagination
        meta={results.meta}
        buildHref={(target) => `/genres/${slug}${target === 1 ? '' : `?page=${target}`}`}
      />

      <div className="mt-10">
        <AdSlot placementKey="browse_in_grid" format="leaderboard" />
      </div>
    </div>
  );
}
