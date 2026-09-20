import type { Metadata } from 'next';
import { apiFetch, qs } from '@/lib/api';
import { RequestForm } from '@/components/support/RequestForm';
import { formatRelativeTime } from '@/lib/utils';
import { SmartImage as Image } from '@/components/ui/SmartImage';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Request an anime',
  description: 'Ask for a title that is not on the site yet.',
  alternates: { canonical: '/request' },
};

interface PublicRequest {
  id: string;
  title: string;
  titleJapanese: string | null;
  status: 'PENDING' | 'REVIEWING' | 'APPROVED' | 'AVAILABLE' | 'REJECTED';
  createdAt: string;
  user: { username: string; avatarUrl: string | null } | null;
  fulfilledAnime: { slug: string; titleEnglish: string; posterUrl: string | null } | null;
}

const STATUS_STYLE: Record<PublicRequest['status'], { label: string; className: string }> = {
  PENDING: { label: 'Pending', className: 'bg-surface-2 text-ink-muted' },
  REVIEWING: { label: 'Reviewing', className: 'bg-warn/15 text-warn' },
  APPROVED: { label: 'Approved', className: 'bg-brand/20 text-brand-bright' },
  AVAILABLE: { label: 'Available', className: 'bg-ok/15 text-ok' },
  REJECTED: { label: 'Not possible', className: 'bg-danger/15 text-danger' },
};

export default async function RequestPage() {
  const queue = await apiFetch<{ data: PublicRequest[] }>(`/anime-requests/public${qs({ limit: 20 })}`).catch(() => ({
    data: [] as PublicRequest[],
  }));

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8 md:px-6">
      <header className="mb-7">
        <h1 className="text-[1.6rem] font-extrabold text-ink md:text-[2rem]">Request an anime</h1>
        <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-ink-muted">
          Cannot find something? Tell us what it is and we will look into whether we can add it. Requests are reviewed
          manually, so please be patient — and check the queue below before submitting a duplicate.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <RequestForm />

        <aside>
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-ink-faint">Request queue</h2>

          {queue.data.length === 0 ? (
            <p className="card-surface px-4 py-8 text-center text-[13px] text-ink-faint">
              Nothing in the queue right now.
            </p>
          ) : (
            <ul className="card-surface divide-y divide-line-soft overflow-hidden">
              {queue.data.map((request) => {
                const style = STATUS_STYLE[request.status];
                return (
                  <li key={request.id} className="px-3.5 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="clamp-2 text-[13px] font-semibold text-ink">{request.title}</p>
                        {request.titleJapanese ? (
                          <p className="truncate text-[11.5px] text-ink-faint">{request.titleJapanese}</p>
                        ) : null}
                      </div>
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${style.className}`}>
                        {style.label}
                      </span>
                    </div>

                    {request.fulfilledAnime ? (
                      <Link
                        href={`/anime/${request.fulfilledAnime.slug}`}
                        className="mt-2 flex items-center gap-2 rounded-lg bg-base px-2 py-1.5 transition hover:bg-surface-2"
                      >
                        <span className="relative h-10 w-7 shrink-0 overflow-hidden rounded bg-surface-2">
                          {request.fulfilledAnime.posterUrl ? (
                            <Image
                              src={request.fulfilledAnime.posterUrl}
                              alt=""
                              fill
                              sizes="28px"
                              className="object-cover"
                            />
                          ) : null}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[12px] text-accent">
                          Now available — watch it
                        </span>
                      </Link>
                    ) : null}

                    <p className="mt-1.5 text-[11px] text-ink-faint">
                      {request.user ? `by ${request.user.username} · ` : ''}
                      {formatRelativeTime(request.createdAt)}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
