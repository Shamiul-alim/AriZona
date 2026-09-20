import { SmartImage as Image } from '@/components/ui/SmartImage';
import Link from 'next/link';
import type { LatestEpisode } from '@/lib/types';
import { formatRelativeTime, formatTime, typeLabel } from '@/lib/utils';

export function EpisodeCard({ episode }: { episode: LatestEpisode }) {
  const { anime } = episode;

  return (
    <Link href={`/watch/${anime.slug}/ep-${episode.number}`} className="group/ep block" aria-label={`${anime.titleEnglish} episode ${episode.number}`}>
      <div className="relative aspect-video overflow-hidden rounded-xl bg-surface-2 ring-1 ring-line-soft transition-all duration-300 group-hover/ep:ring-brand/60">
        {episode.thumbnailUrl ? (
          <Image
            src={episode.thumbnailUrl}
            alt=""
            fill
            sizes="(max-width: 640px) 80vw, (max-width: 1024px) 40vw, 24vw"
            className="object-cover transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/ep:scale-[1.06]"
          />
        ) : anime.posterUrl ? (
          <Image src={anime.posterUrl} alt="" fill sizes="24vw" className="object-cover opacity-60 blur-sm" />
        ) : null}

        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />

        <span className="absolute left-2 top-2 rounded-md bg-black/78 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink backdrop-blur-sm">
          {typeLabel(anime.type)}
        </span>

        <div className="absolute right-2 top-2 flex gap-1">
          {episode.hasSub ? (
            <span className="rounded bg-accent/90 px-1.5 py-0.5 text-[10px] font-bold text-[#04221f]">SUB</span>
          ) : null}
          {episode.hasDub ? (
            <span className="rounded bg-hot/90 px-1.5 py-0.5 text-[10px] font-bold text-white">DUB</span>
          ) : null}
        </div>

        <div className="absolute inset-x-2 bottom-2 flex items-center justify-between">
          <span className="rounded-md bg-brand/90 px-2 py-0.5 text-[11px] font-bold text-white backdrop-blur-sm">
            EP {episode.number}
          </span>
          {episode.durationSeconds ? (
            <span className="rounded-md bg-black/78 px-1.5 py-0.5 text-[10px] font-semibold text-ink-soft backdrop-blur-sm">
              {formatTime(episode.durationSeconds)}
            </span>
          ) : null}
        </div>

        <span className="pointer-events-none absolute inset-0 grid place-items-center opacity-0 transition-opacity duration-300 group-hover/ep:opacity-100">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-brand/95 shadow-[0_0_28px_-4px_rgb(124_92_255/0.9)]">
            <svg viewBox="0 0 24 24" fill="currentColor" className="ml-0.5 h-4.5 w-4.5 text-white" aria-hidden="true">
              <path d="M7.5 4.8a1 1 0 0 1 1.52-.85l9.2 6.2a1 1 0 0 1 0 1.7l-9.2 6.2a1 1 0 0 1-1.52-.85V4.8Z" />
            </svg>
          </span>
        </span>
      </div>

      <h3 className="clamp-2 mt-2 text-[13px] font-semibold leading-snug text-ink transition-colors group-hover/ep:text-brand-bright">
        {anime.titleEnglish}
      </h3>
      <p className="mt-0.5 truncate text-[11.5px] text-ink-faint">
        {episode.title ? `${episode.title} · ` : ''}
        {formatRelativeTime(episode.createdAt)}
      </p>
    </Link>
  );
}

export function EpisodeCardSkeleton() {
  return (
    <div>
      <div className="skeleton aspect-video rounded-xl" />
      <div className="skeleton mt-2 h-3.5 w-10/12 rounded" />
      <div className="skeleton mt-1.5 h-3 w-1/2 rounded" />
    </div>
  );
}
