import { SmartImage as Image } from '@/components/ui/SmartImage';
import Link from 'next/link';

type Tier = 'S' | 'A' | 'B' | 'C' | 'D' | 'F';

interface TierItem {
  id: string;
  tier: Tier;
  label: string;
  order: number;
  anime: { id: string; slug: string; titleEnglish: string; posterUrl: string | null } | null;
}

const TIER_COLOURS: Record<Tier, string> = {
  S: '#ff4d5e',
  A: '#ffa94d',
  B: '#ffd93d',
  C: '#51cf66',
  D: '#4dabf7',
  F: '#9775fa',
};

export function TierListView({ items, order }: { items: TierItem[]; order: readonly Tier[] }) {
  const grouped = new Map<Tier, TierItem[]>();
  for (const item of items) {
    grouped.set(item.tier, [...(grouped.get(item.tier) ?? []), item]);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line-soft">
      {order
        .filter((tier) => (grouped.get(tier) ?? []).length > 0)
        .map((tier) => (
          <div key={tier} className="flex border-b border-line-soft last:border-b-0">
            <div
              className="grid w-14 shrink-0 place-items-center text-[1.35rem] font-extrabold text-[#141420]"
              style={{ background: TIER_COLOURS[tier] }}
            >
              {tier}
            </div>
            <div className="flex flex-1 flex-wrap gap-2 bg-base/60 p-2.5">
              {(grouped.get(tier) ?? [])
                .sort((a, b) => a.order - b.order)
                .map((item) =>
                  item.anime ? (
                    <Link key={item.id} href={`/anime/${item.anime.slug}`} className="group/t w-16" title={item.label}>
                      <span className="relative block aspect-[2/3] overflow-hidden rounded bg-surface-2 ring-1 ring-line-soft transition group-hover/t:ring-brand/60">
                        {item.anime.posterUrl ? (
                          <Image src={item.anime.posterUrl} alt={item.label} fill sizes="64px" className="object-cover" />
                        ) : null}
                      </span>
                      <span className="clamp-2 mt-1 block text-[10px] leading-tight text-ink-muted">{item.label}</span>
                    </Link>
                  ) : (
                    <span
                      key={item.id}
                      className="grid h-14 min-w-16 place-items-center rounded bg-surface-2 px-2 text-center text-[11px] font-medium text-ink-soft"
                    >
                      {item.label}
                    </span>
                  ),
                )}
            </div>
          </div>
        ))}
    </div>
  );
}
