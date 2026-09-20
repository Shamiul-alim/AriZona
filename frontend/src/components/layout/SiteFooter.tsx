import Link from 'next/link';
import { SITE_NAME } from '@/lib/config';
import { Logo } from './Logo';

const COLUMNS: Array<{ title: string; links: Array<{ href: string; label: string }> }> = [
  {
    title: 'Browse',
    links: [
      { href: '/browse?sort=updated', label: 'Recently Updated' },
      { href: '/browse?sort=added', label: 'Recently Added' },
      { href: '/browse?sort=views', label: 'Most Viewed' },
      { href: '/browse?sort=score', label: 'Top Rated' },
      { href: '/browse?status=ONGOING', label: 'Ongoing' },
      { href: '/browse?status=COMPLETED', label: 'Completed' },
      { href: '/az', label: 'A-Z List' },
    ],
  },
  {
    title: 'Community',
    links: [
      { href: '/community', label: 'Discussion Board' },
      { href: '/leaderboard', label: 'Leaderboard' },
      { href: '/request', label: 'Request Anime' },
      { href: '/guides', label: 'Guides & FAQ' },
      { href: '/contact', label: 'Contact Support' },
    ],
  },
  {
    title: 'Help',
    links: [
      { href: '/guides/how-to-watch', label: 'How to Watch' },
      { href: '/guides/player-troubleshooting', label: 'Player Troubleshooting' },
      { href: '/guides/sub-vs-dub', label: 'SUB vs DUB' },
      { href: '/guides/subtitles', label: 'Subtitle Help' },
      { href: '/guides/community-rules', label: 'Community Rules' },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-line-soft bg-base/60">
      <div className="mx-auto max-w-[1600px] px-4 py-12 md:px-6">
        <div className="grid gap-10 md:grid-cols-[1.5fr_repeat(3,1fr)]">
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-ink-muted">
              An anime streaming platform built for people who care about audio options, readable subtitles and a
              community worth reading.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-ink-faint">{column.title}</h2>
              <ul className="space-y-2">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-[13px] text-ink-muted transition hover:text-ink">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-line-soft pt-6 text-[12px] text-ink-faint md:flex-row md:items-center md:justify-between">
          <p>
            © {new Date().getFullYear()} {SITE_NAME}. All content is streamed by the operator of this installation.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link href="/guides/dmca" className="transition hover:text-ink-soft">
              DMCA
            </Link>
            <Link href="/guides/privacy" className="transition hover:text-ink-soft">
              Privacy
            </Link>
            <Link href="/guides/terms" className="transition hover:text-ink-soft">
              Terms
            </Link>
            <Link href="/contact" className="transition hover:text-ink-soft">
              Contact
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
