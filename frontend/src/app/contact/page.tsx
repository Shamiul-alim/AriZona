import type { Metadata } from 'next';
import Link from 'next/link';
import { ContactForm } from '@/components/support/ContactForm';

export const metadata: Metadata = {
  title: 'Contact support',
  description: 'Get in touch about technical problems, advertising, account issues or content notices.',
  alternates: { canonical: '/contact' },
};

const ROUTES = [
  {
    title: 'Something is broken in the player',
    body: 'Use the Report button on the watch page instead — it attaches the episode, server and timestamp automatically, which makes it far quicker to fix.',
    href: '/guides/player-troubleshooting',
    linkLabel: 'Player troubleshooting',
  },
  {
    title: 'A title is missing',
    body: 'Anime requests go through the request queue so other members can see and follow them.',
    href: '/request',
    linkLabel: 'Request an anime',
  },
  {
    title: 'Account or sign-in trouble',
    body: 'Most sign-in problems are solved by resetting your password.',
    href: '/auth/forgot-password',
    linkLabel: 'Reset your password',
  },
];

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8 md:px-6">
      <header className="mb-7">
        <h1 className="text-[1.6rem] font-extrabold text-ink md:text-[2rem]">Contact support</h1>
        <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-ink-muted">
          Send us a message and we will get back to you. Check the shortcuts on the right first — most things have a
          faster route than the inbox.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <ContactForm />

        <aside className="space-y-3">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-ink-faint">Faster routes</h2>
          {ROUTES.map((route) => (
            <div key={route.href} className="card-surface p-4">
              <h3 className="text-[13.5px] font-semibold text-ink">{route.title}</h3>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">{route.body}</p>
              <Link
                href={route.href}
                className="mt-2 inline-block text-[12.5px] font-semibold text-brand-bright transition hover:underline"
              >
                {route.linkLabel} →
              </Link>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}
