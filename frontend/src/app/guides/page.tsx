import type { Metadata } from 'next';
import Link from 'next/link';
import { GUIDES, type Guide } from '@/lib/guides';

export const metadata: Metadata = {
  title: 'Guides & FAQ',
  description: 'How to watch, player troubleshooting, SUB vs DUB, subtitles, account help and community rules.',
  alternates: { canonical: '/guides' },
};

const CATEGORY_ORDER: Array<Guide['category']> = ['Watching', 'Account', 'Community', 'Legal'];

export default function GuidesPage() {
  const grouped = new Map<Guide['category'], Guide[]>();
  for (const guide of GUIDES) {
    grouped.set(guide.category, [...(grouped.get(guide.category) ?? []), guide]);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-6">
      <header className="mb-8">
        <h1 className="text-[1.6rem] font-extrabold text-ink md:text-[2rem]">Guides &amp; FAQ</h1>
        <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-ink-muted">
          Everything about watching, your account and the community — written against how this site actually behaves.
        </p>
      </header>

      <div className="space-y-8">
        {CATEGORY_ORDER.filter((category) => grouped.has(category)).map((category) => (
          <section key={category}>
            <h2 className="mb-3 flex items-center gap-2.5 text-[1.05rem] font-bold text-ink">
              <span className="inline-block h-5 w-1 rounded-full bg-gradient-to-b from-brand-bright to-accent" />
              {category}
            </h2>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {(grouped.get(category) ?? []).map((guide) => (
                <Link
                  key={guide.slug}
                  href={`/guides/${guide.slug}`}
                  className="card-surface p-4 transition hover:border-brand/40"
                >
                  <h3 className="text-[14px] font-semibold text-ink">{guide.title}</h3>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">{guide.summary}</p>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
