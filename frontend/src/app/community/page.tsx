import type { Metadata } from 'next';
import Link from 'next/link';
import { apiFetch, qs } from '@/lib/api';
import type { CommunityCategory, CommunityPostSummary, Paginated } from '@/lib/types';
import { AdSlot } from '@/components/ads/AdSlot';
import { Pagination } from '@/components/ui/Pagination';
import { PostRow } from '@/components/community/PostRow';
import { CommunityToolbar } from '@/components/community/CommunityToolbar';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Community',
  description: 'Discussion, recommendations, tier lists, polls and matchups from the community.',
  alternates: { canonical: '/community' },
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : (value ?? undefined);
}

export default async function CommunityPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const category = first(params.category);
  const kind = first(params.kind);
  const sort = first(params.sort) ?? 'newest';
  const q = first(params.q);
  const page = Number(first(params.page) ?? 1);

  const [categories, posts] = await Promise.all([
    apiFetch<CommunityCategory[]>('/community/categories', { revalidate: 300 }).catch(() => []),
    apiFetch<Paginated<CommunityPostSummary>>(
      `/community/posts${qs({ category, kind, sort, q, page, limit: 20 })}`,
    ).catch(() => ({
      data: [] as CommunityPostSummary[],
      meta: { page: 1, limit: 20, total: 0, totalPages: 0, hasPrevious: false, hasNext: false },
    })),
  ]);

  const buildHref = (target: number) =>
    `/community${qs({ category, kind, sort: sort === 'newest' ? undefined : sort, q, page: target === 1 ? undefined : target })}`;

  const activeCategory = categories.find((c) => c.slug === category);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 md:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.6rem] font-extrabold text-ink md:text-[2rem]">
            {activeCategory ? activeCategory.name : 'Community'}
          </h1>
          <p className="mt-1 max-w-2xl text-[13.5px] text-ink-muted">
            {activeCategory?.description ??
              'Discussion, recommendations, tier lists, polls and matchups. Tag spoilers and keep it civil.'}
          </p>
        </div>
        <Link
          href="/community/new"
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-4 text-[13.5px] font-semibold text-white transition hover:bg-brand-bright"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2}>
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          New post
        </Link>
      </header>

      <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="space-y-2">
          <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Categories</h2>
          <nav className="space-y-0.5">
            <Link
              href="/community"
              aria-current={!category}
              className={
                !category
                  ? 'flex items-center justify-between rounded-lg bg-brand/15 px-3 py-2 text-[13px] font-semibold text-ink'
                  : 'flex items-center justify-between rounded-lg px-3 py-2 text-[13px] text-ink-soft transition hover:bg-white/5 hover:text-ink'
              }
            >
              All posts
            </Link>
            {categories.map((c) => (
              <Link
                key={c.id}
                href={`/community${qs({ category: c.slug })}`}
                aria-current={category === c.slug}
                className={
                  category === c.slug
                    ? 'flex items-center justify-between rounded-lg bg-brand/15 px-3 py-2 text-[13px] font-semibold text-ink'
                    : 'flex items-center justify-between rounded-lg px-3 py-2 text-[13px] text-ink-soft transition hover:bg-white/5 hover:text-ink'
                }
              >
                <span className="flex items-center gap-2">
                  <span aria-hidden="true">{c.icon}</span>
                  {c.name}
                </span>
                {c._count ? <span className="text-[11px] text-ink-faint">{c._count.posts}</span> : null}
              </Link>
            ))}
          </nav>

          <AdSlot placementKey="community_list" format="rectangle" className="mt-5 hidden lg:block" />
        </aside>

        <div className="min-w-0">
          <CommunityToolbar />

          {posts.data.length === 0 ? (
            <div className="card-surface mt-4 grid place-items-center px-6 py-16 text-center">
              <p className="text-[14px] font-medium text-ink-soft">Nothing posted here yet</p>
              <p className="mt-1 max-w-sm text-[13px] text-ink-faint">Be the first to start a conversation.</p>
              <Link
                href="/community/new"
                className="mt-4 rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-brand-bright"
              >
                Create a post
              </Link>
            </div>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {posts.data.map((post) => (
                <PostRow key={post.id} post={post} />
              ))}
            </ul>
          )}

          <Pagination meta={posts.meta} buildHref={buildHref} />
        </div>
      </div>
    </div>
  );
}
