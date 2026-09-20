'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/profile', label: 'Overview' },
  { href: '/profile/watchlist', label: 'My List' },
  { href: '/profile/favorites', label: 'Favourites' },
  { href: '/profile/history', label: 'History' },
  { href: '/profile/settings', label: 'Settings' },
];

export function ProfileTabs() {
  const pathname = usePathname();

  return (
    <nav className="rail mb-6 flex gap-1 overflow-x-auto border-b border-line-soft" aria-label="Profile sections">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative shrink-0 px-3.5 py-2.5 text-[13.5px] font-medium transition',
              active ? 'text-ink' : 'text-ink-muted hover:text-ink',
            )}
          >
            {tab.label}
            {active ? (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-brand-bright to-accent" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
