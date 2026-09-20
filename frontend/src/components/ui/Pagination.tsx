import Link from 'next/link';
import type { PaginationMeta } from '@/lib/types';
import { cn } from '@/lib/utils';

interface PaginationProps {
  meta: PaginationMeta;
  /** Builds the href for a given page, preserving the current filters. */
  buildHref: (page: number) => string;
}

/**
 * Server-rendered pagination. Pages are real links so they are crawlable,
 * shareable and work without JavaScript — which matters because the catalogue
 * is the SEO surface of the whole site.
 */
export function Pagination({ meta, buildHref }: PaginationProps) {
  if (meta.totalPages <= 1) return null;

  const pages = pageWindow(meta.page, meta.totalPages);

  return (
    <nav className="mt-8 flex flex-wrap items-center justify-center gap-1.5" aria-label="Pagination">
      <PageLink href={buildHref(1)} disabled={!meta.hasPrevious} label="First">
        ««
      </PageLink>
      <PageLink href={buildHref(meta.page - 1)} disabled={!meta.hasPrevious} label="Previous">
        «
      </PageLink>

      {pages.map((page, index) =>
        page === '…' ? (
          <span key={`gap-${index}`} className="px-1.5 text-[13px] text-ink-faint">
            …
          </span>
        ) : (
          <Link
            key={page}
            href={buildHref(page)}
            aria-current={page === meta.page ? 'page' : undefined}
            className={cn(
              'inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-3 text-[13px] font-semibold transition',
              page === meta.page
                ? 'bg-brand text-white'
                : 'bg-surface text-ink-soft ring-1 ring-line-soft hover:bg-surface-2 hover:text-ink',
            )}
          >
            {page}
          </Link>
        ),
      )}

      <PageLink href={buildHref(meta.page + 1)} disabled={!meta.hasNext} label="Next">
        »
      </PageLink>
      <PageLink href={buildHref(meta.totalPages)} disabled={!meta.hasNext} label="Last">
        »»
      </PageLink>

      <span className="ml-2 w-full text-center text-[12px] text-ink-faint sm:w-auto">
        Page {meta.page} of {meta.totalPages} · {meta.total.toLocaleString()} titles
      </span>
    </nav>
  );
}

function PageLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span
        aria-hidden="true"
        className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg bg-surface/40 px-3 text-[13px] text-ink-faint/50"
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg bg-surface px-3 text-[13px] text-ink-soft ring-1 ring-line-soft transition hover:bg-surface-2 hover:text-ink"
    >
      {children}
    </Link>
  );
}

/** Produces e.g. [1, '…', 7, 8, 9, '…', 42] around the current page. */
function pageWindow(current: number, total: number): Array<number | '…'> {
  const span = 2;
  const pages = new Set<number>([1, total]);

  for (let i = current - span; i <= current + span; i += 1) {
    if (i > 0 && i <= total) pages.add(i);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const result: Array<number | '…'> = [];

  for (let i = 0; i < sorted.length; i += 1) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('…');
    result.push(sorted[i]);
  }
  return result;
}
