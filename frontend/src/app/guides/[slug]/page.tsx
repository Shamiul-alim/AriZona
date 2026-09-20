import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GUIDES, findGuide } from '@/lib/guides';

export function generateStaticParams() {
  return GUIDES.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const guide = findGuide(slug);
  if (!guide) return { title: 'Guide not found' };

  return {
    title: guide.title,
    description: guide.summary,
    alternates: { canonical: `/guides/${guide.slug}` },
  };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = findGuide(slug);
  if (!guide) notFound();

  const index = GUIDES.findIndex((g) => g.slug === slug);
  const previous = index > 0 ? GUIDES[index - 1] : null;
  const next = index < GUIDES.length - 1 ? GUIDES[index + 1] : null;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: guide.sections.map((section) => ({
      '@type': 'Question',
      name: section.heading,
      acceptedAnswer: {
        '@type': 'Answer',
        text: [...section.body, ...(section.list ?? [])].join(' '),
      },
    })),
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav className="mb-4 flex items-center gap-1.5 text-[12.5px] text-ink-faint" aria-label="Breadcrumb">
        <Link href="/guides" className="transition hover:text-ink-soft">
          Guides
        </Link>
        <span>/</span>
        <span className="text-ink-soft">{guide.category}</span>
      </nav>

      <header className="mb-7">
        <h1 className="text-[1.6rem] font-extrabold leading-tight text-ink md:text-[2rem]">{guide.title}</h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-ink-muted">{guide.summary}</p>
      </header>

      <article className="space-y-7">
        {guide.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="mb-2 text-[1.05rem] font-bold text-ink">{section.heading}</h2>
            {section.body.map((paragraph, i) => (
              <p key={i} className="mb-2.5 text-[14px] leading-relaxed text-ink-soft last:mb-0">
                {paragraph}
              </p>
            ))}
            {section.list ? (
              <ul className="mt-2.5 space-y-1.5">
                {section.list.map((item) => (
                  <li key={item} className="flex gap-2.5 text-[13.5px] leading-relaxed text-ink-soft">
                    <span className="mt-[0.55em] h-1 w-1 shrink-0 rounded-full bg-brand-bright" />
                    {item}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </article>

      <nav className="mt-10 flex flex-wrap gap-3 border-t border-line-soft pt-5">
        {previous ? (
          <Link href={`/guides/${previous.slug}`} className="card-surface flex-1 p-3.5 transition hover:border-brand/40">
            <span className="block text-[11px] uppercase tracking-wider text-ink-faint">Previous</span>
            <span className="mt-0.5 block text-[13.5px] font-semibold text-ink">{previous.title}</span>
          </Link>
        ) : null}
        {next ? (
          <Link href={`/guides/${next.slug}`} className="card-surface flex-1 p-3.5 text-right transition hover:border-brand/40">
            <span className="block text-[11px] uppercase tracking-wider text-ink-faint">Next</span>
            <span className="mt-0.5 block text-[13.5px] font-semibold text-ink">{next.title}</span>
          </Link>
        ) : null}
      </nav>

      <div className="mt-6 rounded-xl border border-line-soft bg-surface/50 p-4 text-center">
        <p className="text-[13px] text-ink-muted">Still stuck?</p>
        <Link
          href="/contact"
          className="mt-2 inline-block rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-brand-bright"
        >
          Contact support
        </Link>
      </div>
    </div>
  );
}
