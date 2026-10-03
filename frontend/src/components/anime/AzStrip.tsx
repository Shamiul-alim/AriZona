import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

const LETTERS = ['All', '#', '0-9', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];

interface AzStripProps {
  active?: string;
  /** Renders as links to /az?letter=… instead of /browse. */
  basePath?: string;
}

export async function AzStrip({ active, basePath = '/az' }: AzStripProps) {
  let counts = new Map<string, number>();
  try {
    const index = await apiFetch<Array<{ letter: string; count: number }>>('/anime/az-index', { revalidate: 600 });
    counts = new Map(index.map((row) => [row.letter, row.count]));
  } catch {
    // Counts are decorative; the strip still navigates without them.
  }

  const total = [...counts.values()].reduce((sum, n) => sum + n, 0);

  return (
    <div className="flex flex-wrap gap-1.5">
      {LETTERS.map((letter) => {
        const key = letter === 'All' ? 'all' : letter;
        const count = letter === 'All' ? total : (counts.get(letter) ?? 0);
        const isActive = (active ?? 'all').toLowerCase() === key.toLowerCase();
        const disabled = letter !== 'All' && count === 0;

        // Pressing the letter you are already on clears it rather than
        // navigating to where you already are: it was the one filter on the site
        // that could be switched on but not off. "All" is the absence of the
        // parameter, which is also what the page canonicalises to.
        const href = isActive || key === 'all' ? basePath : `${basePath}?letter=${encodeURIComponent(key)}`;

        return (
          <Link
            key={letter}
            href={href}
            aria-current={isActive}
            aria-disabled={disabled}
            className={cn(
              // A grid of one-character links is the hardest thing on the site to tap,
              // so on a touch pointer each letter gets a full 44px box. A mouse keeps
              // the compact strip.
              'inline-flex min-w-9 items-center justify-center rounded-lg px-2.5 py-1.5 text-[13px] font-semibold transition',
              'pointer-coarse:min-h-11 pointer-coarse:min-w-11',
              isActive
                ? 'bg-brand text-white'
                : disabled
                  ? 'pointer-events-none bg-surface/40 text-ink-faint/50'
                  : 'bg-surface text-ink-soft ring-1 ring-line-soft hover:bg-surface-2 hover:text-ink',
            )}
            title={count > 0 ? `${count} titles` : undefined}
          >
            {letter}
          </Link>
        );
      })}
    </div>
  );
}
