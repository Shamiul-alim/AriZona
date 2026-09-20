'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

const SORTS = [
  { value: 'newest', label: 'Newest' },
  { value: 'top', label: 'Top' },
  { value: 'active', label: 'Active' },
  { value: 'oldest', label: 'Oldest' },
];

const KINDS = [
  { value: '', label: 'All types' },
  { value: 'TEXT', label: 'Discussion' },
  { value: 'POLL', label: 'Polls' },
  { value: 'TIER_LIST', label: 'Tier lists' },
  { value: 'MATCHUP', label: 'Matchups' },
  { value: 'RECOMMENDATION', label: 'Recommendations' },
];

export function CommunityToolbar() {
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');

  useEffect(() => {
    setQuery(params.get('q') ?? '');
  }, [params]);

  const push = useCallback(
    (patch: Record<string, string | undefined>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (!value) next.delete(key);
        else next.set(key, value);
      }
      next.delete('page');
      router.push(`/community?${next.toString()}`);
    },
    [params, router],
  );

  const sort = params.get('sort') ?? 'newest';
  const kind = params.get('kind') ?? '';

  return (
    <div className="card-surface flex flex-wrap items-center gap-2 p-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          push({ q: query.trim() || undefined });
        }}
        className="relative min-w-44 flex-1"
      >
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search posts…"
          aria-label="Search posts"
          className="h-9 w-full rounded-lg border border-line-soft bg-base pl-8 pr-3 text-[13px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/60"
        />
        <svg
          viewBox="0 0 24 24"
          className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink-faint"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.2-3.2" strokeLinecap="round" />
        </svg>
      </form>

      <select
        value={kind}
        onChange={(e) => push({ kind: e.target.value || undefined })}
        aria-label="Post type"
        className="h-9 rounded-lg border border-line-soft bg-base px-3 text-[13px] text-ink outline-none focus:border-brand/60"
      >
        {KINDS.map((k) => (
          <option key={k.value} value={k.value}>
            {k.label}
          </option>
        ))}
      </select>

      <div className="flex gap-1 rounded-lg bg-surface-2 p-0.5">
        {SORTS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => push({ sort: option.value === 'newest' ? undefined : option.value })}
            className={cn(
              'rounded-md px-2.5 py-1.5 text-[12.5px] font-medium transition',
              sort === option.value ? 'bg-brand text-white' : 'text-ink-muted hover:text-ink',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
