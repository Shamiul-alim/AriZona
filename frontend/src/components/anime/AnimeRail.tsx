import type { AnimeCard as AnimeCardType } from '@/lib/types';
import { AnimeCard } from './AnimeCard';

/**
 * Horizontally scrolling shelf. Uses scroll-snap and native overflow rather
 * than a JS carousel, so it stays keyboard- and touch-native and costs nothing
 * on low-end devices.
 */
export function AnimeRail({ items }: { items: AnimeCardType[] }) {
  if (items.length === 0) {
    return <p className="card-surface px-6 py-10 text-center text-[13px] text-ink-faint">Nothing here yet.</p>;
  }

  return (
    <div className="rail -m-2 flex snap-x snap-mandatory gap-1.5 overflow-x-auto p-2">
      {items.map((anime) => (
        <div key={anime.id} className="w-[38vw] shrink-0 snap-start sm:w-[24vw] md:w-[19vw] lg:w-[15vw] xl:w-[12.5vw]">
          <AnimeCard anime={anime} />
        </div>
      ))}
    </div>
  );
}
