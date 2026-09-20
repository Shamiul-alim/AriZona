'use client';

import { SmartImage as Image } from '@/components/ui/SmartImage';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { authFetch } from '@/lib/auth-store';
import { cn, formatCount } from '@/lib/utils';

interface DashboardData {
  stats: {
    totalAnime: number;
    totalEpisodes: number;
    totalUsers: number;
    newUsersThisWeek: number;
    pendingReports: number;
    totalComments: number;
    pendingRequests: number;
    newContactMessages: number;
    viewsToday: number;
    totalViews: number;
  };
  viewSeries: Array<{ date: string; views: number }>;
  popularAnime: Array<{ id: string; slug: string; titleEnglish: string; posterUrl: string | null; viewCount: number }>;
  mediaProviders: Array<{ provider: string; proxied: boolean; configured: boolean }>;
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void authFetch<DashboardData>('/admin/dashboard')
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load the dashboard.'));
  }, []);

  if (error) {
    return <p className="card-surface px-5 py-8 text-center text-[13.5px] text-danger">{error}</p>;
  }

  if (!data) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="skeleton h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  const { stats } = data;
  const peak = Math.max(1, ...data.viewSeries.map((d) => d.views));

  return (
    <div className="space-y-7">
      <header>
        <h1 className="text-[1.5rem] font-extrabold text-ink">Dashboard</h1>
        <p className="mt-1 text-[13px] text-ink-muted">An overview of the catalogue, the community and the queues.</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Anime" value={stats.totalAnime} href="/admin/anime" />
        <Metric label="Episodes" value={stats.totalEpisodes} href="/admin/episodes" />
        <Metric label="Users" value={stats.totalUsers} sub={`+${stats.newUsersThisWeek} this week`} href="/admin/users" />
        <Metric label="Total views" value={stats.totalViews} sub={`${formatCount(stats.viewsToday)} today`} />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Pending reports"
          value={stats.pendingReports}
          href="/admin/reports"
          tone={stats.pendingReports > 0 ? 'warn' : undefined}
        />
        <Metric
          label="Anime requests"
          value={stats.pendingRequests}
          href="/admin/requests"
          tone={stats.pendingRequests > 0 ? 'warn' : undefined}
        />
        <Metric
          label="Support inbox"
          value={stats.newContactMessages}
          href="/admin/contact"
          tone={stats.newContactMessages > 0 ? 'warn' : undefined}
        />
        <Metric label="Comments" value={stats.totalComments} />
      </section>

      <section className="card-surface p-5">
        <h2 className="text-[14px] font-bold text-ink">Views — last 30 days</h2>
        <div className="mt-4 flex h-36 items-end gap-[3px]">
          {data.viewSeries.map((day) => (
            <div
              key={day.date}
              className="group/bar relative flex-1 rounded-t bg-gradient-to-t from-brand/40 to-brand-bright transition-opacity hover:opacity-100"
              style={{ height: `${Math.max(2, (day.views / peak) * 100)}%` }}
            >
              <span className="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-black/90 px-1.5 py-0.5 text-[10px] text-ink opacity-0 transition-opacity group-hover/bar:opacity-100">
                {day.date}: {formatCount(day.views)}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-ink-faint">
          <span>{data.viewSeries[0]?.date}</span>
          <span>{data.viewSeries[data.viewSeries.length - 1]?.date}</span>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card-surface overflow-hidden">
          <header className="border-b border-line-soft px-4 py-3">
            <h2 className="text-[14px] font-bold text-ink">Most viewed</h2>
          </header>
          <ol className="divide-y divide-line-soft">
            {data.popularAnime.map((anime, index) => (
              <li key={anime.id}>
                <Link href={`/anime/${anime.slug}`} className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-white/5">
                  <span className="w-4 text-[13px] font-bold tabular-nums text-ink-faint">{index + 1}</span>
                  <span className="relative h-12 w-8 shrink-0 overflow-hidden rounded bg-surface-2">
                    {anime.posterUrl ? (
                      <Image src={anime.posterUrl} alt="" fill sizes="32px" className="object-cover" />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink-soft">{anime.titleEnglish}</span>
                  <span className="shrink-0 text-[12px] font-bold tabular-nums text-accent">
                    {formatCount(anime.viewCount)}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <section className="card-surface overflow-hidden">
          <header className="border-b border-line-soft px-4 py-3">
            <h2 className="text-[14px] font-bold text-ink">Media providers</h2>
            <p className="text-[11.5px] text-ink-faint">Which storage backends are wired up on this server</p>
          </header>
          <ul className="divide-y divide-line-soft">
            {data.mediaProviders.map((provider) => (
              <li key={provider.provider} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-ink-soft">
                    {provider.provider.replace(/_/g, ' ')}
                  </span>
                  <span className="block text-[11px] text-ink-faint">
                    {provider.proxied ? 'Streamed through this server' : 'Delivered directly to the player'}
                  </span>
                </span>
                <span
                  className={cn(
                    'shrink-0 rounded px-2 py-0.5 text-[10.5px] font-bold',
                    provider.configured ? 'bg-ok/15 text-ok' : 'bg-surface-2 text-ink-faint',
                  )}
                >
                  {provider.configured ? 'Ready' : 'Not configured'}
                </span>
              </li>
            ))}
          </ul>
          <p className="border-t border-line-soft px-4 py-2.5 text-[11.5px] leading-relaxed text-ink-faint">
            Google Drive needs credentials in the backend environment before it can serve media. See
            docs/GOOGLE_DRIVE.md.
          </p>
        </section>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  href,
  tone,
}: {
  label: string;
  value: number;
  sub?: string;
  href?: string;
  tone?: 'warn';
}) {
  const content = (
    <>
      <span className="block text-[11.5px] uppercase tracking-wider text-ink-faint">{label}</span>
      <span className={cn('mt-1 block text-[1.6rem] font-extrabold leading-none', tone === 'warn' ? 'text-warn' : 'text-ink')}>
        {formatCount(value)}
      </span>
      {sub ? <span className="mt-1 block text-[11.5px] text-ink-muted">{sub}</span> : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} className="card-surface px-4 py-3.5 transition hover:border-brand/40">
        {content}
      </Link>
    );
  }
  return <div className="card-surface px-4 py-3.5">{content}</div>;
}
