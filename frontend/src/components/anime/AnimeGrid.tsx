import type { AnimeCard as AnimeCardType } from '@/lib/types';
import { cn } from '@/lib/utils';
import { AnimeCard, AnimeCardSkeleton } from './AnimeCard';

interface AnimeGridProps {
  items: AnimeCardType[];
  className?: string;
  emptyMessage?: string;
  priorityCount?: number;
}

export function AnimeGrid({ items, className, emptyMessage, priorityCount = 0 }: AnimeGridProps) {
  if (items.length === 0) {
    return (
      <div className="card-surface grid place-items-center px-6 py-16 text-center">
        <p className="text-[14px] font-medium text-ink-soft">{emptyMessage ?? 'Nothing here yet'}</p>
        <p className="mt-1 max-w-sm text-[13px] text-ink-faint">
          Try widening your filters, or browse the full catalogue.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-x-1.5 gap-y-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7',
        className,
      )}
    >
      {items.map((anime, index) => (
        <AnimeCard key={anime.id} anime={anime} priority={index < priorityCount} />
      ))}
    </div>
  );
}

export function AnimeGridSkeleton({ count = 14 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-1.5 gap-y-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
      {Array.from({ length: count }, (_, i) => (
        <AnimeCardSkeleton key={i} />
      ))}
    </div>
  );
}
