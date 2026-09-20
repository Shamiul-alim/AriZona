'use client';

import { useEffect, useState } from 'react';
import { apiFetch, qs } from '@/lib/api';
import type { AnimeCard } from '@/lib/types';
import { RankedList } from '@/components/anime/RankedList';
import { SectionHeader, TabGroup } from '@/components/anime/SectionHeader';

type Period = 'day' | 'week' | 'month';

const TABS: Array<{ value: Period; label: string }> = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

export function TopAnimeSection({ initial }: { initial: AnimeCard[] }) {
  const [period, setPeriod] = useState<Period>('week');
  const [items, setItems] = useState<AnimeCard[]>(initial);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (period === 'week') {
      setItems(initial);
      return;
    }

    let cancelled = false;
    setLoading(true);
    apiFetch<AnimeCard[]>(`/anime/top${qs({ period, limit: 10 })}`)
      .then((res) => !cancelled && setItems(res))
      .catch(() => undefined)
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [period, initial]);

  return (
    <section>
      <SectionHeader title="Top Anime">
        <TabGroup tabs={TABS} active={period} onChange={setPeriod} />
      </SectionHeader>
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton h-[4.6rem] rounded-xl" />
          ))}
        </div>
      ) : (
        <RankedList items={items} />
      )}
    </section>
  );
}
