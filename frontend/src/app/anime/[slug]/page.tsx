import type { Metadata } from 'next';
import { SmartImage as Image } from '@/components/ui/SmartImage';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiFetch, apiFetchOrNull, qs } from '@/lib/api';
import { SITE_NAME, SITE_URL } from '@/lib/config';
import type { AnimeCard as AnimeCardType, AnimeDetail, EpisodeSummary, Paginated } from '@/lib/types';
import { formatDate, formatCount, formatDuration, ratingLabel, statusLabel, titleCase, typeLabel } from '@/lib/utils';
import { AdSlot } from '@/components/ads/AdSlot';
import { AnimeRail } from '@/components/anime/AnimeRail';
import { RatingWidget } from '@/components/anime/RatingWidget';
import { SectionHeader } from '@/components/anime/SectionHeader';
import { WatchlistControls } from '@/components/anime/WatchlistControls';
import { CommentsSection } from '@/components/comments/CommentsSection';
import { ExpandableText } from '@/components/ui/ExpandableText';
import { EpisodeList } from '@/components/anime/EpisodeList';

export const revalidate = 120;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const anime = await apiFetchOrNull<AnimeDetail>(`/anime/${slug}`, { revalidate: 300 });
  if (!anime) return { title: 'Not found' };

  const description =
    anime.seoDescription ??
    anime.synopsis?.slice(0, 300) ??
    `Watch ${anime.titleEnglish} online in high quality on ${SITE_NAME}.`;

  return {
    title: anime.seoTitle ?? `Watch ${anime.titleEnglish}`,
    description,
    alternates: { canonical: `/anime/${anime.slug}` },
    openGraph: {
      type: 'video.tv_show',
      title: anime.titleEnglish,
      description,
      url: `${SITE_URL}/anime/${anime.slug}`,
      images: anime.bannerUrl ?? anime.posterUrl ? [{ url: (anime.bannerUrl ?? anime.posterUrl)! }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: anime.titleEnglish,
      description,
    },
  };
}

export default async function AnimeDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // These responses are the same for every visitor — server rendering is
  // anonymous, so no per-user state is in them. Without a revalidate hint
  // apiFetch falls back to `no-store`, which also forces this whole route to
  // render dynamically and defeats the `revalidate` declared above: every
  // visit paid three full round trips to a database on the other side of the
  // world. Per-user state is fetched on the client after hydration.
  const anime = await apiFetchOrNull<AnimeDetail>(`/anime/${slug}`, { revalidate: 120 });
  if (!anime) notFound();

  const [episodes, recommendations] = await Promise.all([
    apiFetch<Paginated<EpisodeSummary>>(`/anime/${slug}/episodes${qs({ limit: 500 })}`, {
      revalidate: 120,
    }).catch(() => ({
      data: [] as EpisodeSummary[],
      meta: { page: 1, limit: 0, total: 0, totalPages: 0, hasPrevious: false, hasNext: false },
    })),
    apiFetch<AnimeCardType[]>(`/anime/${slug}/recommendations${qs({ limit: 14 })}`, {
      revalidate: 300,
    }).catch(() => []),
  ]);

  const firstEpisode = episodes.data[0];
  const resumeEpisode = anime.userState?.lastWatched;

  // Structured data helps search engines surface the title correctly.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': anime.type === 'MOVIE' ? 'Movie' : 'TVSeries',
    name: anime.titleEnglish,
    alternateName: anime.titleJapanese ?? undefined,
    description: anime.synopsis ?? undefined,
    image: anime.posterUrl ?? undefined,
    datePublished: anime.airStartDate ?? undefined,
    genre: anime.genres.map((g) => g.name),
    numberOfEpisodes: anime.totalEpisodes ?? undefined,
    aggregateRating:
      anime.scoreCount > 0
        ? {
            '@type': 'AggregateRating',
            ratingValue: anime.score,
            ratingCount: anime.scoreCount,
            bestRating: 10,
            worstRating: 1,
          }
        : undefined,
    url: `${SITE_URL}/anime/${anime.slug}`,
  };

  const facts: Array<[string, React.ReactNode]> = [
    ['Type', typeLabel(anime.type)],
    ['Status', statusLabel(anime.status)],
    ['Episodes', anime.totalEpisodes ?? anime.publishedEpisodeCount ?? '—'],
    ['Duration', formatDuration(anime.durationMinutes)],
    ['Premiered', anime.season && anime.releaseYear ? `${titleCase(anime.season)} ${anime.releaseYear}` : (anime.releaseYear ?? '—')],
    ['Aired', anime.airStartDate ? `${formatDate(anime.airStartDate)}${anime.airEndDate ? ` – ${formatDate(anime.airEndDate)}` : ''}` : '—'],
    ['Rating', ratingLabel(anime.ageRating) ?? '—'],
    ['Source', anime.source ? titleCase(anime.source) : '—'],
    [
      'Studio',
      anime.studio ? (
        <Link href={`/browse${qs({ studio: anime.studio.slug })}`} className="text-brand-bright hover:underline">
          {anime.studio.name}
        </Link>
      ) : (
        '—'
      ),
    ],
    [
      'Producers',
      anime.producers.length ? (
        <span className="flex flex-wrap gap-x-1.5">
          {anime.producers.map((p, i) => (
            <Link key={p.id} href={`/browse${qs({ producer: p.slug })}`} className="text-brand-bright hover:underline">
              {p.name}
              {i < anime.producers.length - 1 ? ',' : ''}
            </Link>
          ))}
        </span>
      ) : (
        '—'
      ),
    ],
    ['Views', formatCount(anime.viewCount)],
    ['Favourites', formatCount(anime.favoriteCount)],
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Backdrop */}
      <div className="relative h-[clamp(14rem,34vh,22rem)] w-full overflow-hidden">
        {anime.bannerUrl ?? anime.posterUrl ? (
          <Image
            src={(anime.bannerUrl ?? anime.posterUrl)!}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-center"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-void via-void/75 to-void/25" />
      </div>

      <div className="mx-auto max-w-[1600px] px-4 md:px-6">
        <div className="-mt-28 grid gap-8 lg:grid-cols-[18rem_minmax(0,1fr)] xl:grid-cols-[20rem_minmax(0,1fr)]">
          {/* Left column */}
          <div className="space-y-5">
            <div className="relative mx-auto aspect-[2/3] w-44 overflow-hidden rounded-2xl shadow-lift ring-1 ring-white/10 sm:w-52 lg:mx-0 lg:w-full">
              {anime.posterUrl ? (
                <Image src={anime.posterUrl} alt={anime.titleEnglish} fill priority sizes="320px" className="object-cover" />
              ) : null}
            </div>

            <div className="flex flex-col items-center gap-3 lg:items-stretch">
              {firstEpisode ? (
                <Link
                  href={`/watch/${anime.slug}/ep-${resumeEpisode?.episodeNumber ?? firstEpisode.number}`}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-[14px] font-semibold text-white shadow-[0_0_28px_-8px_rgb(124_92_255/0.9)] transition hover:bg-brand-bright"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                    <path d="M7.5 4.8a1 1 0 0 1 1.52-.85l9.2 6.2a1 1 0 0 1 0 1.7l-9.2 6.2a1 1 0 0 1-1.52-.85V4.8Z" />
                  </svg>
                  {resumeEpisode ? `Resume EP ${resumeEpisode.episodeNumber}` : 'Watch Episode 1'}
                </Link>
              ) : (
                <span className="inline-flex h-11 items-center justify-center rounded-xl border border-line bg-surface px-5 text-[13.5px] font-medium text-ink-muted">
                  No episodes available yet
                </span>
              )}

              <WatchlistControls
                slug={anime.slug}
                initialStatus={anime.userState?.watchStatus ?? null}
                initialFavorite={anime.userState?.isFavorite ?? false}
              />
            </div>

            <RatingWidget slug={anime.slug} />

            <dl className="card-surface divide-y divide-line-soft text-[13px]">
              {facts.map(([key, value]) => (
                <div key={key} className="flex gap-3 px-3.5 py-2.5">
                  <dt className="w-24 shrink-0 text-ink-faint">{key}</dt>
                  <dd className="min-w-0 flex-1 text-ink-soft">{value}</dd>
                </div>
              ))}
            </dl>

            <AdSlot placementKey="anime_detail_top" format="rectangle" className="hidden lg:block" />
          </div>

          {/* Right column */}
          <div className="min-w-0 space-y-10 pb-16 lg:pt-28">
            <header>
              <h1 className="text-[clamp(1.5rem,3.6vw,2.4rem)] font-extrabold leading-tight text-ink">
                {anime.titleEnglish}
              </h1>
              {anime.titleJapanese ? (
                <p className="mt-1 text-[14px] text-ink-muted">{anime.titleJapanese}</p>
              ) : null}
              {anime.titles.filter((t) => t.kind === 'SYNONYM').length > 0 ? (
                <p className="mt-1 text-[12.5px] text-ink-faint">
                  Also known as:{' '}
                  {anime.titles
                    .filter((t) => t.kind === 'SYNONYM')
                    .map((t) => t.title)
                    .join(', ')}
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
                {anime.score > 0 ? (
                  <span className="rounded-md bg-gold/15 px-2 py-1 font-bold text-gold">★ {anime.score.toFixed(2)}</span>
                ) : null}
                <span className="rounded-md bg-surface-2 px-2 py-1 text-ink-soft">{typeLabel(anime.type)}</span>
                <span className="rounded-md bg-surface-2 px-2 py-1 text-ink-soft">{statusLabel(anime.status)}</span>
                {ratingLabel(anime.ageRating) ? (
                  <span className="rounded-md bg-surface-2 px-2 py-1 text-ink-soft">{ratingLabel(anime.ageRating)}</span>
                ) : null}
                {anime.subCount > 0 ? (
                  <span className="rounded-md bg-accent/90 px-2 py-1 font-bold text-[#04221f]">SUB {anime.subCount}</span>
                ) : null}
                {anime.dubCount > 0 ? (
                  <span className="rounded-md bg-hot/90 px-2 py-1 font-bold text-white">DUB {anime.dubCount}</span>
                ) : null}
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {anime.genres.map((genre) => (
                  <Link
                    key={genre.id}
                    href={`/genres/${genre.slug}`}
                    className="rounded-full px-2.5 py-1 text-[12px] font-medium transition hover:brightness-125"
                    style={{ background: `${genre.color ?? '#7c5cff'}1f`, color: genre.color ?? '#9a80ff' }}
                  >
                    {genre.name}
                  </Link>
                ))}
              </div>
            </header>

            {anime.synopsis ? (
              <section>
                <h2 className="mb-2 text-[1.05rem] font-bold text-ink">Synopsis</h2>
                <ExpandableText text={anime.synopsis} collapsedLines={5} />
              </section>
            ) : null}

            <AdSlot placementKey="anime_detail_episodes" format="leaderboard" />

            {episodes.data.length > 0 ? (
              <section>
                <SectionHeader title="Episodes" subtitle={`${episodes.meta.total} available`} />
                <EpisodeList
                  animeSlug={anime.slug}
                  episodes={episodes.data}
                  currentEpisode={resumeEpisode?.episodeNumber ?? null}
                />
              </section>
            ) : null}

            {anime.related.length > 0 ? (
              <section>
                <SectionHeader title="Related" />
                <AnimeRail items={anime.related.map((r) => r.anime)} />
              </section>
            ) : null}

            {recommendations.length > 0 ? (
              <section>
                <SectionHeader title="You might also like" subtitle="Based on genre, studio and popularity" />
                <AnimeRail items={recommendations} />
              </section>
            ) : null}

            <CommentsSection animeSlug={anime.slug} title="Discussion" />
          </div>
        </div>
      </div>
    </>
  );
}
