'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import type { UserRole } from '@/lib/types';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  /** Minimum role required to see the link. */
  role?: UserRole;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    title: 'Overview',
    items: [{ href: '/admin', label: 'Dashboard' }],
  },
  {
    title: 'Catalogue',
    items: [
      { href: '/admin/anime', label: 'Anime', role: 'ADMIN' },
      { href: '/admin/episodes', label: 'Episodes', role: 'ADMIN' },
      { href: '/admin/taxonomy', label: 'Genres & Studios', role: 'ADMIN' },
      { href: '/admin/featured', label: 'Homepage Slider', role: 'ADMIN' },
    ],
  },
  {
    title: 'Moderation',
    items: [
      { href: '/admin/reports', label: 'Reports' },
      { href: '/admin/requests', label: 'Anime Requests', role: 'ADMIN' },
      { href: '/admin/contact', label: 'Support Inbox', role: 'ADMIN' },
    ],
  },
  {
    title: 'People',
    items: [
      { href: '/admin/users', label: 'Users', role: 'ADMIN' },
      { href: '/admin/gamification', label: 'Mana & Ranks', role: 'ADMIN' },
    ],
  },
  {
    title: 'Configuration',
    items: [
      { href: '/admin/ads', label: 'Advertising', role: 'ADMIN' },
      { href: '/admin/settings', label: 'Site Settings', role: 'ADMIN' },
      { href: '/admin/activity', label: 'Audit Log', role: 'ADMIN' },
    ],
  },
];

const RANK: Record<UserRole, number> = { USER: 0, MODERATOR: 1, ADMIN: 2, SUPER_ADMIN: 3 };

export function AdminNav() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  if (!user) return null;

  const visible = GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.role || RANK[user.role] >= RANK[item.role]),
  })).filter((group) => group.items.length > 0);

  return (
    <nav className="shrink-0 lg:w-56" aria-label="Admin">
      <div className="card-surface sticky top-20 overflow-hidden">
        <div className="border-b border-line-soft px-4 py-3">
          <p className="text-[13px] font-bold text-ink">Admin</p>
          <p className="text-[11px] text-ink-faint">
            {user.displayName ?? user.username} · {user.role.toLowerCase().replace('_', ' ')}
          </p>
        </div>

        <div className="rail flex gap-1 overflow-x-auto p-2 lg:block lg:space-y-3 lg:overflow-visible">
          {visible.map((group) => (
            <div key={group.title} className="shrink-0">
              <p className="hidden px-2 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint lg:block">
                {group.title}
              </p>
              <div className="flex gap-1 lg:block lg:space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'block shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-[13px] transition',
                        active
                          ? 'bg-brand/15 font-semibold text-ink'
                          : 'text-ink-muted hover:bg-white/5 hover:text-ink',
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="hidden border-t border-line-soft p-2 lg:block">
          <Link
            href="/"
            className="block rounded-lg px-3 py-2 text-[13px] text-ink-muted transition hover:bg-white/5 hover:text-ink"
          >
            ← Back to site
          </Link>
        </div>
      </div>
    </nav>
  );
}
