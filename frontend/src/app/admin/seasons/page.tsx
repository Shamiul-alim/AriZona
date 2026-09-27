'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { qs } from '@/lib/api';
import { authFetch } from '@/lib/auth-store';
import type { PaginationMeta } from '@/lib/types';
import { AdminHeader, Button, Card, Label, TableSkeleton, adminInput } from '@/components/admin/ui';
import { SeasonManager } from '@/components/admin/SeasonManager';

interface AdminAnimeRow {
  id: string;
  slug: string;
  titleEnglish: string;
}

/**
 * Seasons are managed from the anime edit page, which is where an admin already
 * is when they need one, and this route is deliberately not in the sidebar.
 *
 * It is kept because a direct link to it still works and because it is a handy
 * way to reach one title's seasons without opening the whole anime form. It
 * renders the same SeasonManager, so there is one implementation rather than
 * two workflows that can drift apart.
 */
function SeasonsInner() {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [matches, setMatches] = useState<AdminAnimeRow[]>([]);
  const [anime, setAnime] = useState<AdminAnimeRow | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (debounced.length === 0) {
      setMatches([]);
      return;
    }
    let active = true;
    void (async () => {
      try {
        const result = await authFetch<{ data: AdminAnimeRow[]; meta: PaginationMeta }>(
          `/admin/anime${qs({ q: debounced, limit: 8 })}`,
        );
        if (active) setMatches(result.data);
      } catch {
        if (active) setMatches([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [debounced]);

  return (
    <div>
      <AdminHeader
        title="Seasons"
        description="Seasons are normally managed from a title's own edit page. This is a shortcut to one title's seasons."
      />

      <Card title="Title" description="Seasons belong to one anime, so pick that first.">
        {anime ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold text-ink">{anime.titleEnglish}</p>
              <p className="mt-0.5 text-[12px] text-ink-faint">{anime.slug}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/admin/anime/${anime.id}`}>
                <Button variant="secondary" size="sm" type="button">
                  Open anime
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => {
                  setAnime(null);
                  setSearch('');
                }}
              >
                Change title
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <label>
              <Label>Search anime</Label>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Start typing a title…"
                className={adminInput}
              />
            </label>
            {matches.length > 0 ? (
              <ul className="mt-2 divide-y divide-line-soft rounded-lg border border-line-soft">
                {matches.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setAnime(row);
                        setMatches([]);
                        setSearch('');
                      }}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-white/5"
                    >
                      <span className="min-w-0 truncate text-[13.5px] text-ink-soft">{row.titleEnglish}</span>
                      <span className="shrink-0 text-[11.5px] text-ink-faint">{row.slug}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </Card>

      {anime ? (
        <div className="mt-5">
          <SeasonManager animeId={anime.id} />
        </div>
      ) : null}
    </div>
  );
}

export default function AdminSeasonsPage() {
  return (
    <Suspense fallback={<TableSkeleton rows={6} />}>
      <SeasonsInner />
    </Suspense>
  );
}
